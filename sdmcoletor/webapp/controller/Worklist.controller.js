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
        var aItems = oTable.getItems();
        var aSelecionados = [];
        var sTipoDU = null;
        var sObjectId = null;

        // Coleta todos os selecionados e verifica o tipo de DU
        for (var i = 0; i < aItems.length; i++) {
          var oContext = aItems[i].getBindingContext();
          if (oContext && oContext.getProperty("selected")) {
            var sDU = oContext.getProperty("DU");
            if (!sTipoDU) {
              sTipoDU = sDU;
            } else if (sDU !== sTipoDU) {
              sap.m.MessageToast.show("Somente aceita DU do mesmo Tipo");
              return;
            }

            aSelecionados.push(oContext.getObject());
            if (!sObjectId) {
              sObjectId = oContext.getProperty("lpn");
            }
          }
        }

        if (aSelecionados.length > 0) {
          // Salva os selecionados em um modelo global (JSONModel)
          var oModelSelecionados = new sap.ui.model.json.JSONModel(
            aSelecionados
          );
          sap.ui
            .getCore()
            .setModel(oModelSelecionados, "SelecionadosParaTransporte");

          // Navega para a tela de detalhe (Object)
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
            // Verifica se o retorno está vazio
            var that = this;
            if (!oData.results || oData.results.length === 0) {
                // Só carrega mock em DEV/local
                if (window.location.hostname === "localhost") {
                    var oMockModel = new sap.ui.model.json.JSONModel();
                    oMockModel.loadData("localService/locmockserver.json", null, false);
                    that.getView().setModel(oMockModel);
                    // No Worklist.controller.js
                    this.getOwnerComponent().setModel(oMockModel, "MovLpn");
                }
            }

            // Se houver dados reais, nada muda
            var aDepositos = [];
            var oDepositosMap = {};
           // Passo 2: Veja os valores reais de DU nos dados retornados
            console.log("Dados retornados do OData:", oData.results);
            // Você pode filtrar só os campos DU para ver rapidamente:
            console.log("Valores de DU:", oData.results.map(function(item){ return item.DU; }));




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
      },

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

      onSearch: function (oEvent) {
        /*        if (oEvent.getParameters().refreshButtonPressed) {
          // Search field's 'refresh' button has been pressed.
          // This is visible if you select any main list item.
          // In this case no new search is triggered, we only
          // refresh the list binding.
          this.onRefresh();
        } else {
          var aTableSearchState = [];
          var sQuery = oEvent.getParameter("query");

          if (sQuery && sQuery.length > 0) {
            aTableSearchState = [
              new Filter("lpn", FilterOperator.Contains, sQuery),
              new sap.ui.model.Filter("lote_sdm", sap.ui.model.FilterOperator.Contains, sQuery),
            ];
          }
          this._applySearch(aTableSearchState);
        }
      },
  */

        // Descobre qual SearchField disparou o evento
        var sId = oEvent.getSource().getId();
        var sQuery =
          oEvent.getParameter("query") || oEvent.getSource().getValue();
        var aFilters = [];

        // Exemplo de debug:
        console.log("SearchField acionado:", sId);

        // Decide o filtro conforme o campo
        if (sId.indexOf("searchFieldMaterial") !== -1) {
          // Filtro para material
          aFilters.push(
            new sap.ui.model.Filter(
              "material",
              sap.ui.model.FilterOperator.Contains,
              sQuery
            )
          );
        } else if (sId.indexOf("searchLoteSDM") !== -1) {
          // Filtro para lote_sdm
          aFilters.push(
            new sap.ui.model.Filter(
              "lote_sdm",
              sap.ui.model.FilterOperator.Contains,
              sQuery
            )
          );
        } else if (sId.indexOf("searchDepOrigem") !== -1) {
          // Filtro para deposito_origem
          aFilters.push(
            new sap.ui.model.Filter(
              "deposito_origem",
              sap.ui.model.FilterOperator.Contains,
              sQuery
            )
          );
        } else {
          // Filtro geral (exemplo: busca em vários campos)
          aFilters.push(
            new sap.ui.model.Filter({
              filters: [
                new sap.ui.model.Filter(
                  "material",
                  sap.ui.model.FilterOperator.Contains,
                  sQuery
                ),
                new sap.ui.model.Filter(
                  "lote_sdm",
                  sap.ui.model.FilterOperator.Contains,
                  sQuery
                ),
                new sap.ui.model.Filter(
                  "posicao_origem",
                  sap.ui.model.FilterOperator.Contains,
                  sQuery
                ),
              ],
              and: false,
            })
          );
        }

        var oTable = this.byId("table");
        var oBinding = oTable.getBinding("items");
        oBinding.filter(aFilters, "Application");
      },
      /**
       * Event handler for refresh event. Keeps filter, sort
       * and group settings and refreshes the list binding.
       * @public
       */
      onRefresh: function () {
        var oTable = this.byId("table");
        oTable.getBinding("items").refresh();
      },

      /* =========================================================== */
      /* internal methods                                            */
      /* =========================================================== */

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
