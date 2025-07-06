sap.ui.define(
  [
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "../model/formatter",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
  ],
  function (BaseController, JSONModel, formatter, Filter, FilterOperator) {
    "use strict";

    return BaseController.extend("sdmcoletor.controller.Worklist", {
      formatter: formatter,

      /* =========================================================== */
      /* lifecycle methods                                           */
      /* =========================================================== */
      onValidarEntradas: function () {
        var oTable = this.byId("table");
        var aSelectedItems = oTable.getSelectedItems(); // <-- pega os selecionados via UI5
        var aSelecionados = [];
        var sTipoDU = null;
        var sObjectId = null;

        for (var i = 0; i < aSelectedItems.length; i++) {
          var oContext = aSelectedItems[i].getBindingContext();
          if (!oContext) {
            continue;
          }

          var sDU = oContext.getProperty("DU");
          if (!sTipoDU) {
            sTipoDU = sDU;
          } else if (sDU !== sTipoDU) {
            sap.m.MessageToast.show("Somente aceita DU do mesmo Tipo");
            return;
          }

          var oObj = oContext.getObject();
          aSelecionados.push(oObj);

          if (!sObjectId) {
            sObjectId = oObj.lpn;
          }
        }

        if (aSelecionados.length > 0) {
          var oModelSelecionados = new sap.ui.model.json.JSONModel(
            aSelecionados
          );
          sap.ui
            .getCore()
            .setModel(oModelSelecionados, "SelecionadosParaTransporte");

          this.getRouter().navTo(
            "object",
            {
              objectId: sObjectId,
            },
            true
          );
        } else {
          sap.m.MessageToast.show(
            "Selecione ao menos um item para transportar."
          );
        }
      },

      /**
       * Called when the worklist controller is instantiated.
       * @public
       */
      onInit: function () {
        this.byId("page").addStyleClass("zoom70");
        var oViewModel;
        // debugger;
        // keeps the search state
        this._aTableSearchState = [];

        // Model used to manipulate control states
        oViewModel = new JSONModel({
          worklistTableTitle:
            this.getResourceBundle().getText("worklistTableTitle"),
          shareSendEmailSubject: this.getResourceBundle().getText(
            "shareSendEmailWorklistSubject"
          ),
          shareSendEmailMessage: this.getResourceBundle().getText(
            "shareSendEmailWorklistMessage",
            [location.href]
          ),
          tableNoDataText: this.getResourceBundle().getText("tableNoDataText"),
        });
        this.setModel(oViewModel, "worklistView");
        // ✅ Modelo nomeado com dados vazios para garantir que a tabela comece em branco
        //var oEmptyModel = new JSONModel({ results: [] });
        //this.getView().setModel(oEmptyModel);

        // ✅ Modelo base de LPN (vazio também)
        //var oMaterialsModel = new JSONModel({ materialsLPN: [] });
        //this.getView().setModel(oMaterialsModel, "materialsLPN");

        // Modelo nomeado para materiais
        var oMaterialsModel = new JSONModel({
          materialsLPN: [{ material: "12345" }, { material: "67890" }],
        });
        this.getView().setModel(oMaterialsModel, "materialsLPN");

        // --- Novo código para criar modelo de depósitos únicos ---
        var oODataModel = this.getOwnerComponent().getModel();
        // oODataModel.read("/ZC_SDM_MOV_LPN", {                                   -- RVC:05.06.2025
        oODataModel.read("/ZC_SDM_MOVLPN", {
          success: function (oData) {
            var aDepositos = [];
            var oDepositosMap = {};

            oData.results.forEach(function (item) {
              if (
                item.deposito_destino &&
                !oDepositosMap[item.deposito_destino]
              ) {
                oDepositosMap[item.deposito_destino] = true;
                aDepositos.push({
                  key: item.deposito_destino,
                  text: item.deposito_destino,
                });
              }
            });
            //          oModel.read("/ZC_SDM_MOVLPN", {
            //            success: function (oData) {
            //              var oRawModel = new sap.ui.model.json.JSONModel(oData.results);
            //              this.getView().setModel(oRawModel, "rawModel");

            var oDepositosModel = new sap.ui.model.json.JSONModel(aDepositos);
            this.getView().setModel(oDepositosModel, "DepositosDestino");
          }.bind(this),
        });
        // --- Fim do novo código ---
        // Define o foco no input ao iniciar a view
        this.getView().addEventDelegate(
          {
            onAfterShow: function () {
              setTimeout(
                function () {
                  this.byId("inputMaterial").focus();
                }.bind(this),
                100
              );
            },
          },
          this
        );

        var oModelDU = new sap.ui.model.json.JSONModel([
          { key: "TD.", text: "Todos." },
          { key: "LIB.", text: "LIB." },
          { key: "BLOQ.", text: "BLOQ." },
        ]);
        this.getView().setModel(oModelDU, "DUFilter");
      },
      onChangeDU: function (oEvent) {
        var sSelectedKey = oEvent.getSource().getSelectedKey();
        var oTable = this.byId("table");
        var oBinding = oTable.getBinding("items");

        if (sSelectedKey === "TD.") {
          // Se for "Todos", limpa o filtro
          oBinding.filter([]);
        } else {
          // Cria o filtro para o campo DU
          var oFilter = new sap.ui.model.Filter(
            "DU",
            sap.ui.model.FilterOperator.EQ,
            sSelectedKey
          );
          oBinding.filter([oFilter]);
        }

        sap.m.MessageToast.show("Filtro aplicado para DU: " + sSelectedKey);
      },
      /*    onRefreshPress: function () {
        var oView = this.getView();

        // Limpar Select DU
        this.byId("idSelectDU").setSelectedKey("TD.");
        this.getModel("worklistView").setProperty("/duSelecionado", "TD.");

        // Limpar campos de busca (SearchFields e Input)
        this.byId("searchFieldMaterial").setValue("");
        this.byId("searchLoteSDM").setValue("");
        this.byId("searchDepOrigem").setValue("");
        this.byId("searchPosOrigem").setValue("");
        this.byId("inputMaterial").setValue("");

        // Limpar array de materiais digitados (se você estiver usando)
        var oMaterialsModel = oView.getModel("materialsLPN");
        if (oMaterialsModel) {
          oMaterialsModel.setProperty("/materialsLPN", []);
        }
        // Reaplica o filtro da tabela com base em lista vazia
        this.onShowArray(); // isso limpa o filtro de LPN se não houver mais itens

        // Limpar filtros da tabela
        var oTable = this.byId("table");
        var oBinding = oTable.getBinding("items");
        if (oBinding) {
          oBinding.filter([]);
          oBinding.refresh(); // Faz refresh dos dados no backend
        }

        sap.m.MessageToast.show("Tela redefinida e dados atualizados.");  
      },*/

      /* =========================================================== */
      /* event handlers                                              */
      /* =========================================================== */
      //this.getView().setModel(oMaterialsModel, "materials");
      //},
      onAddMaterial: function () {
        console.log(this);
        const oView = this.getView();
        const oModel = oView.getModel("materialsLPN");
        const sMaterial = oView.byId("inputMaterial").getValue().trim();

        if (!sMaterial) {
          sap.m.MessageToast.show("Digite um material.");
          //MessageToast.show("Digite um material.");
          return;
        }

        const aMaterials = oModel.getProperty("/materialsLPN");
        aMaterials.push({ material: sMaterial });

        oModel.setProperty("/materialsLPN", aMaterials);
        oView.byId("inputMaterial").setValue("");
        // Chama a função para filtrar a tabela após adicionar o material
        this.onShowArray();
      },
      onShowArray: function () {
        // 1. Obtenha o array de materiais inseridos
        var aMaterials = this.getView()
          .getModel("materialsLPN")
          .getProperty("/materialsLPN");
        var aLpnValues = aMaterials.map(function (item) {
          return item.material;
        });

        if (aLpnValues.length === 0) {
          sap.m.MessageToast.show("Nenhum material inserido.");
          return;
        }

        // 2. Crie um filtro OR para cada valor de material
        var aFilters = aLpnValues.map(function (lpn) {
          return new sap.ui.model.Filter(
            "lpn",
            sap.ui.model.FilterOperator.EQ,
            lpn
          );
        });

        // 3. Aplique o filtro OR no binding da tabela
        var oTable = this.byId("table");
        var oBinding = oTable.getBinding("items");
        oBinding.filter(
          new sap.ui.model.Filter(aFilters, false),
          "Application"
        ); // false = OR

        sap.m.MessageToast.show("Tabela filtrada pelos LPNs inseridos.");
      },

      /**
       * Triggered by the table's 'updateFinished' event: after new table
       * data is available, this handler method updates the table counter.
       * This should only happen if the update was successful, which is
       * why this handler is attached to 'updateFinished' and not to the
       * table's list binding's 'dataReceived' method.
       * @param {sap.ui.base.Event} oEvent the update finished event
       * @public
       */
      onUpdateFinished: function (oEvent) {
        // update the worklist's object counter after the table update
        var sTitle,
          oTable = oEvent.getSource(),
          iTotalItems = oEvent.getParameter("total");
        // only update the counter if the length is final and
        // the table is not empty
        if (iTotalItems && oTable.getBinding("items").isLengthFinal()) {
          sTitle = this.getResourceBundle().getText("worklistTableTitleCount", [
            iTotalItems,
          ]);
        } else {
          sTitle = this.getResourceBundle().getText("worklistTableTitle");
        }
        this.getModel("worklistView").setProperty(
          "/worklistTableTitle",
          sTitle
        );
      },

      /**
       * Event handler when a table item gets pressed
       * @param {sap.ui.base.Event} oEvent the table selectionChange event
       * @public
       */
      onPress: function (oEvent) {
        // The source is the list item that got pressed
        this._showObject(oEvent.getSource());
      },

      /**
       * Event handler for navigating back.
       * Navigate back in the browser history
       * @public
       */
      onNavBack: function () {
        // eslint-disable-next-line sap-no-history-manipulation
        history.go(-1);
      },
      onSelectCheckBox: function (oEvent) {
        var oCheckBox = oEvent.getSource();
        var oContext = oCheckBox.getBindingContext();
        oContext
          .getModel()
          .setProperty(
            oContext.getPath() + "/selected",
            oCheckBox.getSelected()
          );
      },
      /**        var oTable = this.byId("table");
        var aItems = oTable.getItems();
        var bAllSelected =
          aItems.length > 0 &&
          aItems.every(function (oItem) {
            var oContext = oItem.getBindingContext();
            return oContext && oContext.getProperty("selected");
          });
        this.byId("headerCheckBox").setSelected(bAllSelected);
      },*/

      onHeaderCheckBoxSelect: function (oEvent) {
        var bSelected = oEvent.getParameter("selected");
        var oTable = this.byId("table");
        var aItems = oTable.getItems();

        aItems.forEach(function (oItem) {
          var oContext = oItem.getBindingContext();
          if (oContext) {
            oContext
              .getModel()
              .setProperty(oContext.getPath() + "/selected", bSelected);
          }
        });
      },

      onSearch: function () {
        var oView = this.getView();
        var oTable = this.byId("table");
        var oBinding = oTable.getBinding("items");

        var sCentro = oView.byId("searchFieldCentro").getValue().trim();
        var sMaterial = oView.byId("searchFieldMaterial").getValue().trim();
        var sLote = oView.byId("searchLoteSDM").getValue().trim();

        var aFilters = [];

        if (sCentro) {
          aFilters.push(
            new sap.ui.model.Filter("centro", FilterOperator.Contains, sCentro)
          );
        }

        if (sMaterial) {
          aFilters.push(
            new sap.ui.model.Filter(
              "material",
              FilterOperator.Contains,
              sMaterial
            )
          );
        }

        if (sLote) {
          aFilters.push(
            new sap.ui.model.Filter("lote_sdm", FilterOperator.Contains, sLote)
          );
        }

        oBinding.filter(aFilters);
      },
      onFilterTabelaCompleta: function () {
        var oView = this.getView();
    // ➜  Atualiza lista de posições sempre que o depósito muda
    var sDepositoSelecionado = oView.byId("idSelectDeposito").getSelectedKey();
    this._updatePosicoesByDeposito(sDepositoSelecionado);

        var oTable = this.byId("table");
        var oBinding = oTable.getBinding("items");

        var sCentro = oView.byId("searchFieldCentro").getValue().trim();
        var sMaterial = oView.byId("searchFieldMaterial").getValue().trim();
        var sLote = oView.byId("searchLoteSDM").getValue().trim();
        var sDeposito = oView.byId("idSelectDeposito").getSelectedKey();
        var sPosicao = oView.byId("idComboPosicao").getSelectedKey();
        var sDU = oView.byId("idSelectDU").getSelectedKey();

        // ✅ Se centro estiver vazio, não permite buscar 21062025 1018
        if (!sCentro) {
          sap.m.MessageToast.show("Preencha o Centro para buscar os dados.");
          return;
        }

        var aFilters = [];

        if (sCentro) {
          aFilters.push(
            new sap.ui.model.Filter("centro", FilterOperator.Contains, sCentro)
          );
        }

        if (sMaterial) {
          aFilters.push(
            new sap.ui.model.Filter(
              "material",
              FilterOperator.Contains,
              sMaterial
            )
          );
        }

        if (sLote) {
          aFilters.push(
            new sap.ui.model.Filter("lote_sdm", FilterOperator.Contains, sLote)
          );
        }

        if (sDeposito) {
          aFilters.push(
            new sap.ui.model.Filter(
              "deposito_origem",
              FilterOperator.EQ,
              sDeposito
            )
          );
        }

        if (sPosicao) {
          aFilters.push(
            new sap.ui.model.Filter(
              "posicao_origem",
              FilterOperator.EQ,
              sPosicao
            )
          );
        }

        if (sDU && sDU !== "TD.") {
          aFilters.push(new sap.ui.model.Filter("DU", FilterOperator.EQ, sDU));
        }

        oBinding.filter(aFilters);
      },

      onChangePosicao: function () {
        var sPosicao = this.byId("idComboPosicao").getSelectedKey(); // ou getValue() se quiser o texto
        this.applyAllFilters(); // caso use filtro centralizado
      },
      //  ==============================================================================================

      onCentroChangeComFiltro: function () {
        const oView = this.getView();
        const oRawModel = oView.getModel("rawModel");
        const sCentro = oView
          .byId("searchFieldCentro")
          .getValue()
          .trim()
          .toUpperCase();

        if (!oRawModel) {
          console.warn("rawModel não definido.");
          return;
        }

        /* ----------------------------------------------------------------
       1. Filtra pelo que foi digitado (começa / contém)               */
        const aOrig = oRawModel.getData() || [];
        const aFiltrados = sCentro
          ? aOrig.filter(
              (it) => (it.centro || "").toUpperCase().indexOf(sCentro) === 0 // ← aqui o ajuste
            )
          : [];

        /* ----------------------------------------------------------------
       2. Atualiza tabela (filteredModel)                               */
        let oFiltered = oView.getModel("filteredModel");
        if (!oFiltered) {
          oFiltered = new sap.ui.model.json.JSONModel();
          oView.setModel(oFiltered, "filteredModel");
        }
        oFiltered.setData(aFiltrados);

        /* ----------------------------------------------------------------
       3. Gera listas de Depósitos e Posições                           */
        const mapDep = {},
          mapPos = {};
        const aDepositos = [],
          aPosicoes = [];

        aFiltrados.forEach((it) => {
          if (it.deposito_origem && !mapDep[it.deposito_origem]) {
            mapDep[it.deposito_origem] = true;
            aDepositos.push({
              key: it.deposito_origem,
              text: it.deposito_origem,
            });
          }
          if (it.posicao_origem && !mapPos[it.posicao_origem]) {
            mapPos[it.posicao_origem] = true;
            aPosicoes.push({ key: it.posicao_origem, text: it.posicao_origem });
          }
        });

        /* ----------------------------------------------------------------
       4. Atualiza modelos dos ComboBox **sem** recriar objeto         */
        let oDepModel = oView.getModel("DepositoFilter");
        if (!oDepModel) {
          oDepModel = new sap.ui.model.json.JSONModel();
          oView.setModel(oDepModel, "DepositoFilter");
        }
        oDepModel.setData(aDepositos);

        let oPosModel = oView.getModel("PosicaoFilter");
        if (!oPosModel) {
          oPosModel = new sap.ui.model.json.JSONModel();
          oView.setModel(oPosModel, "PosicaoFilter");
        }
        oPosModel.setData(aPosicoes);
      },

      //=========================================================================
      onCentroChange: function (oEvent) {
        var sCentro = oEvent.getSource().getValue().trim();
        var oView = this.getView();
        // Guarda o centro escolhido num modelo global único
        let oCent = sap.ui.getCore().getModel("CentroSelecionado");
        if (!oCent) {
          oCent = new sap.ui.model.json.JSONModel();
          sap.ui.getCore().setModel(oCent, "CentroSelecionado");
        }
        oCent.setProperty("/centro", sCentro.toUpperCase());

        // Limpa se o campo estiver vazio
        if (!sCentro) {
          this._applySearch([]);

          // Limpa os modelos auxiliares
          var oFiltered = oView.getModel("filteredModel");
          if (oFiltered) {
            oFiltered.setData([]);
          }

          return;
        }

        if (!sCentro) {
          // Limpa filtro se o campo estiver vazio
          this._applySearch([]);
          return;
        }

        // Cria filtro para o campo 'centro'
        var aFilters = [
          new sap.ui.model.Filter(
            "centro",
            sap.ui.model.FilterOperator.Contains,
            sCentro
          ),
        ];

        // Aplica filtro na tabela
        this._applySearch(aFilters);

        // Cria ou carrega o rawModel
        var oRawModel = oView.getModel("rawModel");

        if (!oRawModel) {
          var oModel = oView.getModel(); // OData model
          oModel.read("/ZC_SDM_MOVLPN", {
            urlParameters: {
              $top: "5000",
            },
            success: function (oData) {
              var oJson = new sap.ui.model.json.JSONModel(oData.results);
              oView.setModel(oJson, "rawModel");

              // Aplica filtro após carregar dados
              this.onCentroChangeComFiltro();
            }.bind(this),
            error: function () {
              sap.m.MessageToast.show("Erro ao carregar dados completos.");
            },
          });
        } else {
          // Se já tem dados carregados, aplica o filtro direto
          this.onCentroChangeComFiltro();
        }
      },

      onRefreshPress: function () {
        window.location.reload();

        /*
        var oView = this.getView();

        // 1. Limpa todos os campos do cabeçalho
        oView.byId("searchFieldCentro")?.setValue("");
        oView.byId("searchFieldMaterial")?.setValue("");
        oView.byId("searchLoteSDM")?.setValue("");
        oView.byId("idSelectDeposito")?.setSelectedKey("");
        oView.byId("idComboPosicao")?.setSelectedKey("");
        oView.byId("idSelectDU")?.setSelectedKey("TD.");
        oView.byId("inputMaterial")?.setValue("");

        // 2. Limpa modelo auxiliar de materiais digitados
        var oMaterialsModel = oView.getModel("materialsLPN");
        if (oMaterialsModel) {
          oMaterialsModel.setData({ materialsLPN: [] });
        }

        // 3. Restaura os dados originais (4900 registros) do rawModel no filteredModel
        var oRawModel = oView.getModel("rawModel");
        if (oRawModel && Array.isArray(oRawModel.getData())) {
          var oFilteredModel = oView.getModel("filteredModel");
          if (!oFilteredModel) {
            oFilteredModel = new sap.ui.model.json.JSONModel();
            oView.setModel(oFilteredModel, "filteredModel");
          }
          oFilteredModel.setData(oRawModel.getData());
        }

        // 4. Limpa filtros visuais da tabela
        var oTable = oView.byId("table");
        var oBinding = oTable.getBinding("items");
        if (oBinding) {
          oBinding.filter([]);
          oBinding.refresh();
        }

        // 5. Mensagem de feedback
        sap.m.MessageToast.show("Aplicação reiniciada com sucesso."); */
      },

      /* 
----->  onCentroChange: function (oEvent) {
        var sCentro = oEvent.getSource().getValue().trim();

        if (!sCentro) {
          // Limpa filtro se o campo estiver vazio
          this._applySearch([]);
          return;
        }

        // Cria filtro para o campo 'centro'
        var aFilters = [
          new sap.ui.model.Filter(
            "centro",
            sap.ui.model.FilterOperator.Contains,
            sCentro
          ),
        ];

        // Aplica filtro na tabela
        this._applySearch(aFilters);

        // 🔧 Verifica se o rawModel já existe
        var oRawData = this.getView().getModel("rawModel");
        if (!oRawData) {
          var oBinding = this.byId("table").getBinding("items");
          if (oBinding) {
            var aData = oBinding.getModel().getProperty(oBinding.getPath());
            if (aData) {
              var oRawModel = new sap.ui.model.json.JSONModel(aData);
              this.getView().setModel(oRawModel, "rawModel");
            }
          }
        }
        this.onCentroChangeComFiltro();
      },


-----> onCentroChangeComFiltro: function () {
        var oView = this.getView();
        var oRawModel = oView.getModel("rawModel");
        var sCentro = oView.byId("searchFieldCentro").getValue().trim();
        var aOriginalData = oView.getModel("rawModel").getData();

        if (!sCentro) {
          oView.getModel("filteredModel").setData([]); // Limpa a tabela
          return;
        }

        // Aplica filtro de Centro
        var aFiltrados = aOriginalData.filter(function (item) {
          return item.centro === sCentro;
        });



        oView.getModel("filteredModel").setData(aFiltrados);

        // Atualiza selects
        var aPosicoes = [],
          aDepositos = [];
        var mapPos = {},
          mapDep = {};

        aFiltrados.forEach(function (item) {
          if (item.posicao_origem && !mapPos[item.posicao_origem]) {
            mapPos[item.posicao_origem] = true;
            aPosicoes.push({
              key: item.posicao_origem,
              text: item.posicao_origem,
            });
          }
          if (item.deposito_origem && !mapDep[item.deposito_origem]) {
            mapDep[item.deposito_origem] = true;
            aDepositos.push({
              key: item.deposito_origem,
              text: item.deposito_origem,
            });
          }
        });

        oView.setModel(
          new sap.ui.model.json.JSONModel(aPosicoes),
          "PosicaoFilter"
        );
        oView.setModel(
          new sap.ui.model.json.JSONModel(aDepositos),
          "DepositoFilter"
        );
      },



       

----->   onRefreshPress: function () {
        var oView = this.getView();

        // Limpa campos de pesquisa LINHA1
        oView.byId("searchFieldCentro").setValue("");
        oView.byId("searchFieldMaterial").setValue("");
        oView.byId("searchLoteSDM").setValue("");
        // Limpa campos de pesquisa LINHA2
        oView.byId("idSelectDeposito").setValue("");
        oView.byId("idComboPosicao").setValue("");
        oView.byId("inputMaterial").setValue("");

        // Limpa filtros no modelo "materialsLPN"
        var oMaterialsModel = oView.getModel("materialsLPN");
        if (oMaterialsModel) {
          oMaterialsModel.setProperty("/materialsLPN", []);
        }
        // Restaura o filtro DEPOSITO para "Todos"
        oView.byId("idSelectDeposito").setSelectedKey("TD.");
        this.getModel("worklistView").setProperty("/duSelecionado", "TD.");
        // Restaura o filtro POSICAO para "Todos"
        oView.byId("idComboPosicao").setSelectedKey("TD.");
        this.getModel("worklistView").setProperty("/duSelecionado", "TD.");
        // Restaura o filtro DU para "Todos"
        oView.byId("idSelectDU").setSelectedKey("TD.");
        this.getModel("worklistView").setProperty("/duSelecionado", "TD.");

        // Limpa os filtros da tabela
        var oTable = this.byId("table");
        var oBinding = oTable.getBinding("items");
        if (oBinding) {
          oBinding.filter([]); // Remove todos os filtros
          oBinding.refresh(); // Força reload
        }

        sap.m.MessageToast.show("Tabela e filtros resetados.");
      },   */

      onSelectChange: function (oEvent) {
        const oTable = oEvent.getSource(); // <Table>
        // Contextos do binding principal (OData)
        const aCtx = oTable.getSelectedContexts();
        const aSelecionados = aCtx.map((c) => c.getObject());

        // Atualiza/Cria o modelo global que a próxima tela precisará
        sap.ui
          .getCore()
          .setModel(
            new sap.ui.model.json.JSONModel(aSelecionados),
            "SelecionadosParaTransporte"
          );
      },



      /* =========================================================== */
      /* internal methods                                            */
      /* =========================================================== */
      /** ------------------------------------------------------------------
 *  Gera/atualiza o modelo "PosicaoFilter" de acordo com o depósito
 * ------------------------------------------------------------------*/
_updatePosicoesByDeposito: function (sDeposito) {
    var oView     = this.getView();
    var oRawModel = oView.getModel("rawModel");          // universo já carregado
    if (!oRawModel) { return; }

    var aOrig   = oRawModel.getData() || [];
    var oSeen   = {};
    var aLista  = [];

    aOrig.forEach(function (it) {
        if (it.deposito_origem === sDeposito && it.posicao_origem) {
            if (!oSeen[it.posicao_origem]) {
                oSeen[it.posicao_origem] = true;
                aLista.push({ key: it.posicao_origem, text: it.posicao_origem });
            }
        }
    });

    var oPosModel = oView.getModel("PosicaoFilter");
    if (!oPosModel) {
        oPosModel = new sap.ui.model.json.JSONModel();
        oView.setModel(oPosModel, "PosicaoFilter");
    }
    oPosModel.setData(aLista);
},


      /**
       * Shows the selected item on the object page
       * @param {sap.m.ObjectListItem} oItem selected Item
       * @private
       */
      _showObject: function (oItem) {
        this.getRouter().navTo(
          "object",
          {
            objectId: oItem
              .getBindingContext()
              .getPath()
              //      .substring("/ZC_SDM_MOV_LPN".length),                               -- RVC:05.06.2025
              .substring("/ZC_SDM_MOVLPN".length),
          },
          true
        );
      },

      /**
       * Internal helper method to apply both filter and search state together on the list binding
       * @param {sap.ui.model.Filter[]} aTableSearchState An array of filters for the search
       * @private
       */
      _applySearch: function (aTableSearchState) {
        var oTable = this.byId("table"),
          oViewModel = this.getModel("worklistView");
        oTable.getBinding("items").filter(aTableSearchState, "Application");
        // changes the noDataText of the list in case there are no filter results
        if (aTableSearchState.length !== 0) {
          oViewModel.setProperty(
            "/tableNoDataText",
            this.getResourceBundle().getText("worklistNoDataWithSearchText")
          );
        }
      },
    });
  }
);
