sap.ui.define(
  [
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "../model/formatter",
  ],
  function (BaseController, JSONModel, History, formatter) {
    "use strict";

    return BaseController.extend("sdmcoletor.controller.Object", {
      formatter: formatter,

      /* =========================================================== */
      /* lifecycle methods                                           */
      /* =========================================================== */

      /**
       * Called when the worklist controller is instantiated.
       * @public
       */
      onInit: function () {
        // Model used to manipulate control states. The chosen values make sure,
        // detail page shows busy indication immediately so there is no break in
        // between the busy indication for loading the view's meta data
        // Garante que o modelo global está disponível na view
        var oSelecionados = sap.ui
          .getCore()
          .getModel("SelecionadosParaTransporte");
        if (oSelecionados) {
          this.getView().setModel(oSelecionados, "SelecionadosParaTransporte");
        }
 /*           var oModel = this.getOwnerComponent().getModel("MovLpn");
        // comentado para o Mock
         if (oModel) {
          //       oModel.read("/zi_sdm_mov_dep_pos", {
          //       oModel.read("/ZC_SDM_MOV_LPN", { 
          //       oModel.read("/ZC_SDM_MOVLPN"                                                -- RVC:05.06.2025
          oModel.read("/ZC_SDM_MOVLPN", {
            success: function (oData) {
              console.log(oData.results); // Veja no console se existe lgort
              var oDepPosModel = new sap.ui.model.json.JSONModel(oData.results);
              this.getView().setModel(oDepPosModel, "DepPosData");
              this.onConcatenaSelect();
            }.bind(this),
            error: function (oError) {
              // Opcional: log para debug
              console.error("Erro ao ler zi_sdm_mov_dep_pos", oError);
            },
          });
        } else {
          console.error("Modelo MovLpn não encontrado!");
        }      */


     // Pega os dados do modelo MovLpn (mock ou real)
    var oModel = this.getOwnerComponent().getModel("MovLpn");
    if (oModel) {
        var aData = oModel.getData();
        // Se for array direto
        var aResults = Array.isArray(aData) ? aData : aData.results;
        // Seta o modelo DepPosData para uso na view
        var oDepPosModel = new sap.ui.model.json.JSONModel(aResults);
        this.getView().setModel(oDepPosModel, "DepPosData");
        this.onConcatenaSelect();
    } else {
        console.error("Modelo MovLpn não encontrado!");
    }
          







        //this.getView().setModel(oViewModel, "objectView");
        this.getRouter()
          .getRoute("object")
        
          .attachPatternMatched(this._onObjectMatched, this);
      },

      /* =========================================================== */
      /* event handlers                                             */
      /* =========================================================== */
      onNavBack: function () {
        var sPreviousHash = History.getInstance().getPreviousHash();
        if (sPreviousHash !== undefined) {
          // eslint-disable-next-line sap-no-history-manipulation
          history.go(-1);
        } else {
          this.getRouter().navTo("worklist", {}, true);
        }
      },
      onSalvarPress: function () {
        sap.m.MessageToast.show("Salvar pressionado!");
      },

      onConcatenaSelect: function () {
        var oView = this.getView();
        var aSelecionados = oView
          .getModel("SelecionadosParaTransporte")
          .getData();
        var aDepPosModel = oView.getModel("DepPosData").getData();
//        console.log(
//          "SelecionadosParaTransporte:",
 //         oSelModel ? oSelModel.getData() : "NULO"
 //       );
 //       console.log(
 //         "DepPosData:",
 //         oDepPosModel ? oDepPosModel.getData() : "NULO"
 //       );

        // Soma quantidades por posicao_origem      "lnhConst": 1
        var oSomaPorPosicao = {};
        aSelecionados.forEach(function (itemSel) {
          aDepPosModel.forEach(function (itemMov) {
            if (
              itemSel.lpn === itemMov.lpn &&
              itemSel.centro === itemMov.centro &&
              itemSel.deposito_origem === itemMov.deposito_origem &&
              itemSel.posicao_destino === itemMov.posicao_destino
            ) {
              var pos = itemMov.posicao_origem;
              var qtLnh = Number(itemMov.lnhConst) || 0;
              if (!oSomaPorPosicao[pos]) {
                oSomaPorPosicao[pos] = 0;
              }
              oSomaPorPosicao[pos] += qtLnh;
            }
          });
        });

        // Cria array de objetos para o Select, ordenado por quantidade decrescente
        var aSelectOptions = Object.keys(oSomaPorPosicao)
          .map(function (posicao) {
            return {
              POSICAO: posicao,
              QUANT: oSomaPorPosicao[posicao],
              TEXTO: posicao + " - " + oSomaPorPosicao[posicao],
            };
          })
          .sort(function (a, b) {
            return b.QUANT - a.QUANT;
          });

        // Seta no modelo para o Select
        var oPosDestinoModel = new sap.ui.model.json.JSONModel(aSelectOptions);
        oView.setModel(oPosDestinoModel, "PosDestinoConcat");
      },

      onAplicarButtonPress: function () {
        /*     var oModel = this.getOwnerComponent().getModel("MovLpn"); // ou modelo padrão
        oModel.create(
          "/ZC_SDM_MOV_LPN(lpn='FIX119',centro='P203',deposito_origem='ERP')/transf_att",
          {},
          {
            method: "POST",
            success: function (oData) {
              sap.m.MessageToast.show("Ação executada com sucesso!");
            },
            error: function (oError) {
              sap.m.MessageToast.show("Erro ao executar ação!");
              console.error(oError);
            },
          }
        );                                                                        */

        sap.m.MessageToast.show("Transporte efetuado");
      },

      // No controller da worklist (ex: Worklist.controller.js)

      /* =========================================================== */
      /* internal methods                                            */
      /* =========================================================== */

      /**
       * Binds the view to the object path.
       * @function
       * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
       * @private
       */
      _onObjectMatched: function (oEvent) {
        //        var sObjectId =  oEvent.getParameter("arguments").objectId;
        //        this._bindView("/ZC_SDM_MOV_LPN" + sObjectId);
        // Garante que o modelo está atualizado na view ao navegar
        var oSelecionados = sap.ui
          .getCore()
          .getModel("SelecionadosParaTransporte");
        if (oSelecionados) {
          this.getView().setModel(oSelecionados, "SelecionadosParaTransporte");
        }
      },

      /**
       * Binds the view to the object path.
       * @function
       * @param {string} sObjectPath path to the object to be bound
       * @private
       */
      _bindView: function (sObjectPath) {
        var oViewModel = this.getModel("objectView");

        this.getView().bindElement({
          path: sObjectPath,
          events: {
            change: this._onBindingChange.bind(this),
            dataRequested: function () {
              oViewModel.setProperty("/busy", true);
            },
            dataReceived: function () {
              oViewModel.setProperty("/busy", false);
            },
          },
        });
      },

      _onBindingChange: function () {
        var oView = this.getView(),
          oViewModel = this.getModel("objectView"),
          oElementBinding = oView.getElementBinding();

        // No data for the binding
        if (!oElementBinding.getBoundContext()) {
          this.getRouter().getTargets().display("objectNotFound");
          return;
        }

        var oResourceBundle = this.getResourceBundle(),
          oObject = oView.getBindingContext().getObject(),
          sObjectId = oObject.lpn,
          sObjectName = oObject.ZC_SDM_MOVLPN;

        oViewModel.setProperty("/busy", false);
        oViewModel.setProperty(
          "/shareSendEmailSubject",
          oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId])
        );
        oViewModel.setProperty(
          "/shareSendEmailMessage",
          oResourceBundle.getText("shareSendEmailObjectMessage", [
            sObjectName,
            sObjectId,
            location.href,
          ])
        );
      },
    });
  }
);
