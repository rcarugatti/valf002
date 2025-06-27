sap.ui.define(
  [
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "../model/formatter",
    "sap/m/MessageToast",
  ],
  function (BaseController, JSONModel, History, formatter, MessageToast) {
    "use strict";

    return BaseController.extend("sdmcoletor.controller.Object", {
      formatter: formatter,

      onInit: function () {
        var oSelecionados = sap.ui
          .getCore()
          .getModel("SelecionadosParaTransporte");
        if (oSelecionados) {
          this.getView().setModel(oSelecionados, "SelecionadosParaTransporte");
        }
        var oModel = this.getView().getModel("SelecionadosParaTransporte");
        if (oModel) {
          var aData = oModel.getData();
          aData.forEach(function (item) {
            item.selected = false;
            item.deposito_destino = "";
            item.posicao_destino  = "";
          });
          oModel.setData(aData);
        }
        var oModel = this.getOwnerComponent().getModel("MovLpn");
        if (oModel) {
          oModel.read("/ZC_SDM_MOVLPN", {
            success: function (oData) {
              /*   var oDepPosModel = new JSONModel(oData.results);  20.06.2025 11.34              
              this.getView().setModel(oDepPosModel, "DepPosData");
              this.onConcatenaSelect();
            }.bind(this),
            error: function (oError) {
              console.error("Erro ao ler ZC_SDM_MOVLPN", oError);
            },  */

              // Remover duplicados por deposito_origem e posicao_destino
              var aUnicos = [];
              var oKeys = {};
              oData.results.forEach(function (item) {
                var key = item.deposito_origem + "-" + item.posicao_destino;
                if (!oKeys[key]) {
                  oKeys[key] = true;
                  aUnicos.push(item);
                }
              });

              // Ordenar por posicao_destino
              aUnicos.sort(function (a, b) {
                return a.posicao_destino.localeCompare(b.posicao_destino);
              });

              var oDepPosModel = new JSONModel(aUnicos);
              this.getView().setModel(oDepPosModel, "DepPosData");

              this.onConcatenaSelect();
            }.bind(this),
            error: function (oError) {
              console.error("Erro ao ler ZC_SDM_MOVLPN", oError);
            },
          });
        }

        var oDepPostZZ1ODataModel = new sap.ui.model.odata.v2.ODataModel(
          "/sap/opu/odata/sap/ZSB_SDM_MOVIMENTA_LPN/"
        );
        oDepPostZZ1ODataModel.read("/ZZ1_SDM_DEP_POS?$top=100&$skip=100", {
          success: function (oData) {
            var oDepPostZZ1Model = new JSONModel(oData.results);
            this.getView().setModel(oDepPostZZ1Model, "DepPostZZ1");
            this.onConcatenaSelect();
          }.bind(this),
          error: function (oError) {
            MessageToast.show("Erro ao carregar DepPostZZ1");
          },
        });

        this.getRouter()
          .getRoute("object")
          .attachPatternMatched(this._onObjectMatched, this);
      },

      onConcatenaSelect: function () {
        // var oView = this.getView();
        // var aSelecionados = oView
        //   .getModel("SelecionadosParaTransporte")
        //   .getData();
        // var aDepPosModel = oView.getModel("DepPostZZ1").getData();

        var oView = this.getView();
        var oSel = oView.getModel("SelecionadosParaTransporte");
        var oDep = oView.getModel("DepPostZZ1");
        if (!oSel || !oDep) {
          return;
        }

        var aSelecionados = oSel.getData();
        var aDepPosModel = oDep.getData();

        var oSomaPorPosicao = {};
        var oDepositosUnicos = {};

        aDepPosModel.forEach(function (itemMov) {
          var chave = itemMov.LGORT + "-" + itemMov.POSIT;

          var ocorrencias = aSelecionados.filter(function (itemSel) {
            return (
              itemSel.centro === itemMov.WERKS &&
              itemSel.deposito_origem === itemMov.LGORT &&
              itemSel.posicao_origem === itemMov.POSIT
            );
          }).length;

          if (!oSomaPorPosicao[chave]) {
            oSomaPorPosicao[chave] = 0;
          }
          oSomaPorPosicao[chave] += ocorrencias;

          if (!oDepositosUnicos[itemMov.LGORT]) {
            oDepositosUnicos[itemMov.LGORT] = {
              DEPOSITO: itemMov.LGORT,
              TEXTO: itemMov.LGORT,
            };
          }
        });

        // Cria array para posições
        var aSelectOptions = Object.keys(oSomaPorPosicao).map(function (chave) {
          var split = chave.split("-");
          return {
            DEPOSITO: split[0],
            POSICAO: split[1],
            QUANT: oSomaPorPosicao[chave],
            TEXTO: split[1] + " - " + oSomaPorPosicao[chave],
          };
        });

        // Ordena posições por ordem ASC
        aSelectOptions.sort((a, b) => a.POSICAO.localeCompare(b.POSICAO));

        var oPosDestinoModel = new JSONModel(aSelectOptions);
        oView.setModel(oPosDestinoModel, "PosDestinoConcat");
        oView.setModel(new JSONModel(aSelectOptions), "PosDestinoConcatFull");

        // Depósitos únicos ordenados
        var aDepositosUnicos = Object.values(oDepositosUnicos).sort((a, b) =>
          a.DEPOSITO.localeCompare(b.DEPOSITO)
        );
        var oDepDestinoModel = new JSONModel(aDepositosUnicos);
        oView.setModel(oDepDestinoModel, "DepDestinoConcat");
      },

      onChangeDepositoDestino: function (oEvent) {
        var oSelectDeposito = oEvent.getSource();
        var sDepositoSelecionado = oSelectDeposito.getSelectedKey();

        var oItem = oSelectDeposito.getParent();
        var oSelectPosicao = oItem
          .getCells()
          .find((cell) => cell.getId().includes("idSelectPosDest"));

        var oView = this.getView();
        var aTodasOpcoes = oView.getModel("PosDestinoConcatFull").getData();

        var aFiltradas = sDepositoSelecionado
          ? aTodasOpcoes.filter(
              (item) => item.DEPOSITO === sDepositoSelecionado
            )
          : aTodasOpcoes;

        var oModelFiltrado = new JSONModel(aFiltradas);
        oSelectPosicao.setModel(oModelFiltrado);
        oSelectPosicao.bindItems(
          "/",
          new sap.ui.core.Item({
            key: "{POSICAO}",
            text: "{TEXTO}",
          })
        );
      },

      onChangeDepoDestHeader: function (oEvent) {
        var sDepositoSelecionado = oEvent.getSource().getSelectedKey();
        var oView = this.getView();
        var aTodasOpcoes = oView.getModel("PosDestinoConcatFull").getData();

        var aFiltradas = sDepositoSelecionado
          ? aTodasOpcoes.filter(
              (item) => item.DEPOSITO === sDepositoSelecionado
            )
          : aTodasOpcoes;

        oView.getModel("PosDestinoConcat").setData(aFiltradas);
      },
      /* 
onAplicarButtonPress: function () {
    var oTable = this.byId("objectTable");
    var aItems = oTable.getItems();

    // Pega os valores selecionados no cabeçalho
    var sDepDestinoHeader = this.byId("idSelectHeaderDepDestino").getSelectedKey();
    var sPosDestinoHeader = this.byId("idSelectPosDestino").getSelectedKey();

    aItems.forEach(function (oItem) {
        var oContext = oItem.getBindingContext("SelecionadosParaTransporte");
        if (oContext) {
            var sPath = oContext.getPath();
            var bSelected = oContext.getModel().getProperty(sPath + "/selected");

            if (bSelected) {
                var aCells = oItem.getCells();

                // Atualiza selects visuais nas linhas
                var oSelectDepDestino = aCells.find((cell) =>
                    cell.getId().includes("idSelectDepDestino")
                );
                var oSelectPosDestino = aCells.find((cell) =>
                    cell.getId().includes("idSelectPosDest")
                );

                if (oSelectDepDestino) {
                    oSelectDepDestino.setSelectedKey(sDepDestinoHeader);
                }

                if (oSelectPosDestino) {
                    oSelectPosDestino.setSelectedKey(sPosDestinoHeader);
                }

                // Atualiza o modelo JSON das linhas
                oContext.getModel().setProperty(sPath + "/deposito_destino", sDepDestinoHeader);
                oContext.getModel().setProperty(sPath + "/posicao_destino", sPosDestinoHeader);
            }
        }
    });

    sap.m.MessageToast.show("Valores aplicados às linhas selecionadas.");
},

      

      onAplicarButtonPress: function () {
        var oTable = this.byId("objectTable");
        var aItems = oTable.getItems();

        var sDepDestinoHeader = this.byId(
          "idSelectHeaderDepDestino"
        ).getSelectedKey();
        var sPosDestinoHeader =
          this.byId("idSelectPosDestino").getSelectedKey();

        var oView = this.getView();
        var aTodasPosicoes =
          oView.getModel("PosDestinoConcatFull")?.getData() || [];

        aItems.forEach(function (oItem) {
          var oContext = oItem.getBindingContext("SelecionadosParaTransporte");
          if (!oContext) return;

          var sPath = oContext.getPath();
          var bSelected = oContext.getModel().getProperty(sPath + "/selected");

          if (bSelected) {
            var aCells = oItem.getCells();

            // DEPÓSITO DESTINO
            var oSelectDepDestino = aCells.find((cell) =>
              cell.getId().includes("idSelectDepDestino")
            );
            if (oSelectDepDestino) {
              oSelectDepDestino.setSelectedKey(sDepDestinoHeader);
            }

            // Atualiza modelo com o novo depósito destino
            oContext
              .getModel()
              .setProperty(sPath + "/deposito_destino", sDepDestinoHeader);

            // POSIÇÃO DESTINO
            var oSelectPosDestino = aCells.find((cell) =>
              cell.getId().includes("idSelectPosDest")
            );
            if (oSelectPosDestino) {
              // Filtrar posições com base no depósito destino
              var aFiltradas = aTodasPosicoes.filter(function (item) {
                return item.DEPOSITO === sDepDestinoHeader;
              });

              var oModelFiltrado = new sap.ui.model.json.JSONModel(aFiltradas);

              // Setar o modelo e rebindar os items
              oSelectPosDestino.setModel(oModelFiltrado);
              oSelectPosDestino.bindItems(
                "/",
                new sap.ui.core.Item({
                  key: "{POSICAO}",
                  text: "{TEXTO}",
                })
              );

              // Após rebind, aplicar selectedKey
              oSelectPosDestino.setSelectedKey(sPosDestinoHeader);
            }

            // Atualiza modelo com a nova posição destino
            oContext
              .getModel()
              .setProperty(sPath + "/posicao_destino", sPosDestinoHeader);
          }
        });

        sap.m.MessageToast.show("Destino aplicado às linhas marcadas.");
      },  */
      ///===============================================================================
      onAplicarButtonPress: function () {
        console.log("⏩ onAplicarButtonPress");

        var oTable = this.byId("objectTable");
        console.log("Table:", !!oTable);

        var sDepDestino = this.byId(
          "idSelectHeaderDepDestino"
        ).getSelectedKey();
        var sPosDestino = this.byId("idSelectPosDestino").getSelectedKey();
        console.log("Header values →", {
          deposito: sDepDestino,
          posicao: sPosDestino,
        });

        if (!sDepDestino) {
          console.log("Abort: depósito vazio");
          sap.m.MessageToast.show("Selecione o depósito destino");
          return;
        }

        var aCtx =
          oTable.getSelectedContexts("SelecionadosParaTransporte") || [];
        console.log("Contexts selecionados:", aCtx.length);

        aCtx.forEach(function (oCtx, i) {
          var sPath = oCtx.getPath();
          console.log("Linha", i, "→ path:", sPath);

          var oModel = oCtx.getModel();
          oModel.setProperty(sPath + "/deposito_destino", sDepDestino);
          oModel.setProperty(sPath + "/posicao_destino", sPosDestino);
        });

        sap.m.MessageToast.show("Destino aplicado às linhas selecionadas.");
        console.log("✅ Fim onAplicarButtonPress");
      },

      ///===============================================================================
      onHeaderCheckBoxSelect: function (oEvent) {
        var bSelected = oEvent.getParameter("selected");
        var oTable = this.byId("objectTable");
        var aItems = oTable.getItems();

        aItems.forEach(function (oItem) {
          var oContext = oItem.getBindingContext("SelecionadosParaTransporte");
          if (oContext) {
            oContext
              .getModel()
              .setProperty(oContext.getPath() + "/selected", bSelected);
          }
        });
      },

      onNavBack: function () {
        var sPreviousHash = History.getInstance().getPreviousHash();
        if (sPreviousHash !== undefined) {
          history.go(-1);
        } else {
          this.getRouter().navTo("worklist", {}, undefined, true);
        }
      },
//===============================================================================


onSalvarPress: function () {
    const oFuncModel = this.getOwnerComponent().getModel("MovimentaLpn");
    const oTable     = this.byId("objectTable");

    // ← remove o parâmetro truen
    const aCtx       = oTable.getBinding("items").getContexts(); 

    let iOK = 0, iSkip = 0;

    for (const ctx of aCtx) {
        const oData = ctx.getObject();   // agora não deve ser undefined

        if (!oData || !oData.deposito_destino) {
            iSkip++;
            continue;
        }

        const oParams = {
            material         : oData.material,
            lpn              : oData.lpn,
            centro           : oData.centro,
            deposito_origem  : oData.deposito_origem,
            posicao_origem   : oData.posicao_origem,
            deposito_destino : oData.deposito_destino,
            posicao_destino  : oData.posicao_destino
        };

        oFuncModel.callFunction("/transferir_lpn", {
            method        : "POST",
            urlParameters : oParams,
            success : () =>
                sap.m.MessageToast.show(`LPN ${oData.lpn} transferida com sucesso.`),
            error   : err => {
                sap.m.MessageBox.error(`Erro ao transferir LPN ${oData.lpn}`);
                console.error(err);
            }
        });

        iOK++;
    }

    const sMsg =
        iOK === 0
            ? "Nenhuma LPN com depósito destino preenchido para processar."
            : `Processadas ${iOK} LPN(s).` +
              (iSkip ? ` ${iSkip} ignorada(s) sem depósito destino.` : "");

    sap.m.MessageToast.show(sMsg);
},

   

   

//===============================================================================


      onSelectChange: function (oEvent) {
        var oTable = oEvent.getSource();
        var aSelectedItems = oTable.getSelectedItems();

        var aSelecionados = aSelectedItems.map(function (oItem) {
          return oItem
            .getBindingContext("SelecionadosParaTransporte")
            .getObject();
        });

        // Exemplo: salvar num modelo global
        var oModelSelecionados = new sap.ui.model.json.JSONModel(aSelecionados);
        sap.ui.getCore().setModel(oModelSelecionados, "SelecionadosParaGravar");
      },

      _onObjectMatched: function () {
        var oSelecionados = sap.ui
          .getCore()
          .getModel("SelecionadosParaTransporte");
        if (!oSelecionados) return;

        this.getView().setModel(oSelecionados, "SelecionadosParaTransporte");

        var aData = oSelecionados.getData();
        if (!Array.isArray(aData)) return;

        var bBloqueado = aData.some(function (item) {
          return item.DU === "BLOQ.";
        });

        var oView = this.getView();

        // Bloqueia cabeçalho
        var oHeaderSelect = oView.byId("idSelectHeaderDepDestino");
        if (oHeaderSelect) {
          oHeaderSelect.setSelectedKey("CFQ");
          oHeaderSelect.setEnabled(!bBloqueado);
        }
        var sDU = aData[0]?.DU || "";
        var oDUModel = new sap.ui.model.json.JSONModel({ duAtiva: sDU });
        this.getView().setModel(oDUModel, "DUModel");
        // Bloqueia todos os selects de linha (Depósito)
        var oTable = oView.byId("objectTable");
        var aItems = oTable.getItems();

        aItems.forEach(function (oItem) {
          var aCells = oItem.getCells();

          /*          var oSelectDepDestino = aCells.find(function (cell) {
            return cell.getId().includes("idSelectDepDestino");
          });

          var oSelectPosDestino = aCells.find(function (cell) {
            return cell.getId().includes("idSelectPosDest");
          });                                                  23 06 2025 1521    */

          // if (oSelectDepDestino) {
          //   oSelectDepDestino.setEnabled(!bBloqueado);
          //   oSelectDepDestino.setSelectedKey("CFQ");
          // }

          // if (oSelectPosDestino) {
          //   //  oSelectPosDestino.setEnabled(!bBloqueado);
          // }
        });
      },

      /*   
      _onObjectMatched: function () {
        var oSelecionados = sap.ui
          .getCore()
          .getModel("SelecionadosParaTransporte");
        if (oSelecionados) {
          this.getView().setModel(oSelecionados, "SelecionadosParaTransporte");

          var aData = oSelecionados.getData();

          if (aData && Array.isArray(aData)) {
            var bBloqueado = aData.some(function (item) {
              return item.DU === "BLOQ.";
            });

            if (bBloqueado) {
              this.byId("idSelectHeaderDepDestino").setSelectedKey("CFQ");
              this.byId("idSelectHeaderDepDestino").setEnabled(false);
            } else {
              this.byId("idSelectHeaderDepDestino").setEnabled(true);
            }
          }
        }
      },
     
       */
    });
  }
);
