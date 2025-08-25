/***********************************************************************/
/* PROGRAM ID           : N/A                                          */
/* PROGRAM TITLE        : Display Data                                 */
/* AUTHOR               : Carugatti, Rodolfo                           */
/* DATE                 : 06/10/2024                                   */
/* SUPPLIER             : Wayon                                        */
/* DEVELOPMENT ID       :                                              */
/* CHANGE REQUEST NUMBER:                                              */
/* Approval Number      : N/A                                          */
/* DESCRIPTION          :                                              */
/*                                                                     */
/*=====================================================================*/
/* COPIED FROM         :  N/A                                          */
/* TITLE               :  N/A                                          */
/* OTHER RELATED OBJ   :  N/A                                          */
/*=====================================================================*/
/* CHANGE HISTORY LOG                                                  */
/*---------------------------------------------------------------------*/
/* MOD. NO.|  DATE    | NAME   |CORRECTION NUMBER  |CHANGE REFERENCE # */
/*---------------------------------------------------------------------*/




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
        /* 1. Validação do Centro ---------------------------------- */
        let sCentro = "-";
        const oCentroModel = sap.ui.getCore().getModel("CentroSelecionado");
        if (oCentroModel) {
          sCentro = (oCentroModel.getProperty("/centro") || "").trim();
        }
        if (!sCentro) {
          sap.m.MessageToast.show(
            "Preencha o campo Centro antes de prosseguir."
          );
          return;
        }

        const oTable = this.byId("table");

        // Captura diretamente os contextos selecionados
        const aCtx = oTable.getSelectedContexts("rawModel"); // garantia do modelo
        if (!aCtx.length) {
          sap.m.MessageToast.show(
            "Selecione ao menos um item para transportar."
          );
          return;
        }

        const aSelecionados = [];
        let sTipoDU = null;
        let sObjectId = null;

        for (let i = 0; i < aCtx.length; i++) {
          const oCtx = aCtx[i];
          const sDU = oCtx.getProperty("DU");

          if (!sTipoDU) {
            sTipoDU = sDU; // primeira linha define o tipo
          } else if (sDU !== sTipoDU) {
            sap.m.MessageToast.show("Somente aceita DU do mesmo Tipo");
            return; // abandona sem navegar
          }

          const oObj = oCtx.getObject();
          aSelecionados.push(oObj);
          if (!sObjectId) {
            sObjectId = oObj.lpn;
          }
        }

        // Salva e navega
        sap.ui
          .getCore()
          .setModel(new JSONModel(aSelecionados), "SelecionadosParaTransporte");
        this.getRouter().navTo("object", { objectId: sObjectId }, true);
      },

      /**
       * Called when the worklist controller is instantiated.
       * @public
       */
      onInit: function () {
        this.byId("page").addStyleClass("zoom70");
        var oViewModel;

        // Subscreve ao evento básico de refresh
        sap.ui
          .getCore()
          .getEventBus()
          .subscribe(
            "Worklist", // canal
            "Refresh", // evento
            function () {
              // callback simples em linha
              this.getOwnerComponent().getModel("MovLpn").refresh(true);
              const oTbl = this.byId("table");
              oTbl?.getBinding("items")?.refresh(); // se preciso
            }.bind(this)
          );

        // Subscreve ao evento de refresh com itens processados
        sap.ui
          .getCore()
          .getEventBus()
          .subscribe(
            "Worklist", // canal
            "RefreshWithProcessedItems", // evento
            function (sChannelId, sEventId, oData) {
              console.log(
                "📥 Recebido evento RefreshWithProcessedItems:",
                oData
              );

              // Processa os itens que foram transferidos com sucesso
              if (
                oData &&
                oData.itensProcessados &&
                oData.itensProcessados.length > 0
              ) {
                this._processSuccessfulItems(
                  oData.itensProcessados,
                  oData.totalProcessados
                );
              }
            }.bind(this)
          );
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
        // Leitura combinada MOVIMENTA + TRANSFERE
        this._loadMergedData();

        // Modelo nomeado para materiais
        var oMaterialsModel = new JSONModel({
          materialsLPN: [{ material: "12345" }, { material: "67890" }],
        });
        this.getView().setModel(oMaterialsModel, "materialsLPN");

        // --- Novo código para criar modelo de depósitos únicos ---
        var oODataModel = this.getOwnerComponent().getModel();
        oODataModel.read("/ZCDS_SDM_MOVIMENTA_LPN", {
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

            var oDepositosModel = new sap.ui.model.json.JSONModel(aDepositos);
            this.getView().setModel(oDepositosModel, "DepositosDestino");
          }.bind(this),
        });
        // --- Fim do novo código ---
        // Define o foco no input ao iniciar a view
this.getView().addEventDelegate(
  {
    onAfterShow: function () {
      /* 1. Limpa seleção visual da tabela */
      const oTable = this.byId("table");
      if (oTable) {
        // true = suprime o evento selectionChange
        oTable.removeSelections(true);
      }

      /* 2. Zera a flag 'selected' no modelo rawModel (consistência) */
      const oRaw = this.getView().getModel("rawModel");
      if (oRaw) {
        const aData = oRaw.getData() || [];
        aData.forEach(it => { it.selected = false; });
        oRaw.refresh(false); // não força nova leitura OData
      }

      /* 3. Mantém o comportamento anterior: foco no leitor */
      setTimeout(() => { this.byId("inputMaterial").focus(); }, 100);
    }
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

      /* =========================================================== */
      /* event handlers                                              */
      /* =========================================================== */
      onAddMaterial: function () {
        console.log(this);
        const oView = this.getView();
        const oModel = oView.getModel("materialsLPN");
        const sMaterial = oView.byId("inputMaterial").getValue().trim();

        if (!sMaterial) {
          sap.m.MessageToast.show("Digite um material.");
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
        var sPreviousHash = History.getInstance().getPreviousHash();
        // Limpa o modelo SelecionadosParaTransporte ao voltar
        sap.ui
          .getCore()
          .setModel(
            new sap.ui.model.json.JSONModel([]),
            "SelecionadosParaTransporte"
          );
        // Limpa o modelo rawModel (zera a tabela)
        var oView = this.getView();
        var oRawModel = oView.getModel("rawModel");
        if (oRawModel) {
          oRawModel.setData([]);
        }
        if (sPreviousHash !== undefined) {
          history.go(-1);
        } else {
          this.getRouter().navTo("worklist", {}, undefined, true);
        }
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

        // Replace empty Centro with '-'
        if (!sCentro) {
          sCentro = "-";
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

        oBinding.filter(aFilters);
      },
      onFilterTabelaCompleta: function () {
        var oView = this.getView();
        var oTable = this.byId("table");
        var oBinding = oTable.getBinding("items");

        var sCentro = oView.byId("searchFieldCentro").getValue().trim();
        var sMaterial = oView.byId("searchFieldMaterial").getValue().trim();
        var sLote = oView.byId("searchLoteSDM").getValue().trim();
        var sDeposito = oView.byId("idSelectDeposito").getSelectedKey();
        var sPosicao = oView.byId("idComboPosicao").getSelectedKey();
        var sDU = oView.byId("idSelectDU").getSelectedKey();

        // Replace empty Centro with '-'
        if (!sCentro) {
          sCentro = "-";
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
        var sPosicao = this.byId("idComboPosicao").getSelectedKey();
        this.applyAllFilters();
      },

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

      onCentroChange: function (oEvent) {
        // Replace empty Centro with '-'
        //if (!sCentro) {
        //  sCentro = "-";
        //}
        
        

        var sCentro = oEvent.getSource().getValue().trim();
        sCentro = (sCentro || "").trim() || "-";
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
          oModel.read("/ZCDS_SDM_MOVIMENTA_LPN", {
            urlParameters: {
              $top: 50000  // Limite de 50.000 registros
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
      },

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
        var oView = this.getView();
        var oRawModel = oView.getModel("rawModel"); // universo já carregado
        if (!oRawModel) {
          return;
        }

        var aOrig = oRawModel.getData() || [];
        var oSeen = {};
        var aLista = [];

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
      /* =========================================================== */
      /* navegação Worklist → Object                                 */
      /* =========================================================== */
      _showObject: function (oItem) {
        const oObj = oItem.getBindingContext("rawModel").getObject();
        this.getRouter().navTo("object", { objectId: oObj.lpn }, true);
      },

      /**
       * Faz dois OData.read em paralelo, mergeia os registros e publica
       * no modelo "rawModel".
       */
      _loadMergedData: function () {
        const oOData = this.getOwnerComponent().getModel();
        let aMov, aTra;

        const merge = function () {
          if (!aMov || !aTra) return;
          const oHash = {};

          const makeKey = (lpn, centro, deposito) =>
            `${lpn}-${centro}-${deposito}`;

          // 1. Indexa TRANSFERE
          aTra.forEach((t) => {
            oHash[makeKey(t.lpn, t.centro, t.deposito_origem)] = t;
          });

          // 2. Faz o merge registro a registro
          const aMerge = aMov.map((m) => {
            // procura TRANSFERE do mesmo LPN + Centro + Depósito
            const t = oHash[makeKey(m.lpn, m.centro, m.deposito_origem)] || {};

            const nEst = Number(m.quantidade || 0);
            const nQual = Number(m.stck_qualid || m.StckQuant || 0);
            const nTotal = nEst + nQual;
            const sDU = nQual > 0 ? "BLOQ." : "LIB.";

            return Object.assign({}, m, {
              deposito_origem: m.deposito,
              posicao_origem: m.posicao,
              deposito_destino: t.deposito_destino ?? "",
              posicao_destino: t.posicao_destino ?? "",
              quantidade: nTotal,
              DU: sDU,
              selected: false, // Ensure all items are unmarked
            });
          });

          this.getView().setModel(new JSONModel(aMerge), "rawModel");
        }.bind(this);

        // 1. MOVIMENTA
        oOData.read("/ZCDS_SDM_MOVIMENTA_LPN", {
          urlParameters: { $top: 50000 },
          success: (oData) => {
            aMov = oData.results;
            merge();
          },
          error: console.error,
        });

        // 2. TRANSFERE
        oOData.read("/ZCDS_SDM_TRANSFERE_LPN", {
          urlParameters: { $top: 50000 },
          success: (oData) => {
            aTra = oData.results;
            merge();
          },
          error: console.error,
        });
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

      /**
       * Processa os itens que foram transferidos com sucesso na Object view
       * @param {Array} aItensProcessados - Array com os itens processados com sucesso
       * @param {number} iTotalProcessados - Número total de itens processados
       */
      _processSuccessfulItems: function (aItensProcessados, iTotalProcessados) {
        console.log(
          `🎯 Processando ${iTotalProcessados} itens transferidos com sucesso`
        );
        setTimeout(() => {
          this._restoreProcessedItemsWithUpdatedData(
            aItensProcessados,
            iTotalProcessados
          );

          // Atualiza o modelo SelecionadosParaTransporte com os dados atualizados
          this._updateSelecionadosModelWithRefreshedData(aItensProcessados);
        }, 1000);
      },

      /**
       * Restaura os itens processados na lista com os dados atualizados (novos depósitos/posições)
       * @param {Array} aItensProcessados - Array com os itens processados
       * @param {number} iTotalProcessados - Número total de itens processados
       */
      _restoreProcessedItemsWithUpdatedData: function (
        aItensProcessados,
        iTotalProcessados
      ) {
        const oTable = this.byId("table");
        const oRawModel = this.getView().getModel("rawModel");

        if (!oRawModel) {
          console.warn("⚠️ Modelo rawModel não encontrado para atualização");
          return;
        }

        const aCurrentData = oRawModel.getData() || [];
        const aLpnsProcessadas = aItensProcessados.map((item) => item.lpn);

        // Atualiza apenas os LPNs processados dentro do array completo
        const aAtualizado = aCurrentData.map((item) => {
          const idx = aLpnsProcessadas.indexOf(item.lpn);
          if (idx !== -1) {
            // Atualiza os campos de depósito/posição com os novos valores
            // Move destino ➜ origem e limpa colunas de destino
            return Object.assign({}, item, {
              deposito_origem: aItensProcessados[idx].deposito_destino,
              posicao_origem: aItensProcessados[idx].posicao_destino,
              deposito_destino: "",
              posicao_destino: "",
              selected: false, // Desmarca o item
            });
          }
          return item;
        });

        oRawModel.setData(aAtualizado);
        oTable.getBinding("items").refresh(true);

        // Filtra para mostrar apenas os LPNs processados
        const oBinding = oTable.getBinding("items");
        if (oBinding && aLpnsProcessadas.length > 0) {
          const aLpnFilters = aLpnsProcessadas.map(function (sLpn) {
            return new Filter("lpn", FilterOperator.EQ, sLpn);
          });

          // Aplica filtro OR para mostrar apenas os LPNs processados
          const oLpnFilter = new Filter(aLpnFilters, false); // false = OR
          oBinding.filter([oLpnFilter]);
        }

        const sMessage =
          iTotalProcessados === 1
            ? `1 item atualizado com novos depósito/posição após transferência.`
            : `${iTotalProcessados} itens atualizados com novos depósitos/posições após transferências.`;

        sap.m.MessageBox.information(sMessage, {
          actions: [sap.m.MessageBox.Action.OK],
          emphasizedAction: sap.m.MessageBox.Action.OK,
          onClose: function (oAction) {
            if (oAction === sap.m.MessageBox.Action.OK) {
              window.location.reload();
            }
          }.bind(this),
        });

        console.log(
          `✅ ${iTotalProcessados} itens atualizados na Worklist com novos depósitos/posições`
        );
        console.log(
          "📋 Itens exibidos:",
          aAtualizado.map(
            (item) =>
              `${item.lpn} - ${item.deposito_destino}/${item.posicao_destino}`
          )
        );
      },

      /**
       * Atualiza o modelo SelecionadosParaTransporte com dados atualizados do servidor
       * @param {Array} aItensProcessados - Array com os itens processados (dados antigos)
       */
      _updateSelecionadosModelWithRefreshedData: function (aItensProcessados) {
        const oRawModel = this.getView().getModel("rawModel");
        if (!oRawModel) {
          console.warn(
            "⚠️ Modelo rawModel não encontrado para atualizar SelecionadosParaTransporte"
          );
          return;
        }

        const aCurrentData = oRawModel.getData() || [];
        const aLpnsProcessadas = aItensProcessados.map((item) => item.lpn);

        // Busca os dados atualizados dos itens processados
        const aItensAtualizados = aCurrentData.filter((item) =>
          aLpnsProcessadas.includes(item.lpn)
        );

        // Atualiza o modelo global SelecionadosParaTransporte com os dados atualizados
        const oSelecionadosModel = new sap.ui.model.json.JSONModel(
          aItensAtualizados
        );
        sap.ui
          .getCore()
          .setModel(oSelecionadosModel, "SelecionadosParaTransporte");

        console.log(
          `🔄 Modelo SelecionadosParaTransporte atualizado com ${aItensAtualizados.length} itens processados`
        );
        console.log(
          "📋 Dados atualizados:",
          aItensAtualizados.map(
            (item) =>
              `${item.lpn}: ${item.deposito_origem}/${item.posicao_origem}`
          )
        );
      },

      /**
       * Limpa todos os campos de busca e filtros (método mantido para compatibilidade)
       */
      _clearSearchFields: function () {
        // Método mantido mas não executa limpeza para preservar estado da busca
        console.log("🔄 Preservando campos de busca após processamento");
      },

      /**
       * Atualiza o título da tabela com a contagem atual
       */
      _updateTableTitle: function () {
        const oTable = this.byId("table");
        const oBinding = oTable.getBinding("items");

        if (oBinding) {
          const iLength = oBinding.getLength() || 0;
          const oViewModel = this.getModel("worklistView");

          if (oViewModel) {
            let sTitle;
            if (iLength && this.getResourceBundle().getText) {
              sTitle = this.getResourceBundle().getText(
                "worklistTableTitleCount",
                [iLength]
              );
            } else {
              sTitle = this.getResourceBundle().getText
                ? this.getResourceBundle().getText("worklistTableTitle")
                : "Lista de LPNs";
            }
            oViewModel.setProperty("/worklistTableTitle", sTitle);
          }
        }
      },
    });
  }
);
          