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
        const oView = this.getView();

        /* ────────────────────────────────────────────────────────────────
         * 0. Modelo SelecionadosParaTransporte (preenche tabela)
         * ────────────────────────────────────────────────────────────────*/
        const oSelecionados = sap.ui
          .getCore()
          .getModel("SelecionadosParaTransporte");
        if (oSelecionados) {
          oView.setModel(oSelecionados, "SelecionadosParaTransporte");

          /* zera flags e destinos a cada navegação */
          const aTmp = oSelecionados.getData();
          aTmp.forEach((it) => {
            it.selected = false;
            it.deposito_destino = "";
            it.posicao_destino = "";
          });
          oSelecionados.setData(aTmp);
        }

        /* ────────────────────────────────────────────────────────────────
         * 1. Centro digitado na Worklist (modelo global CentroSelecionado)
         * ────────────────────────────────────────────────────────────────*/
        let sCentro = "";
        const oCentModel = sap.ui.getCore().getModel("CentroSelecionado");
        if (oCentModel) {
          sCentro = (oCentModel.getProperty("/centro") || "").toUpperCase();
        }

        /* ────────────────────────────────────────────────────────────────
         * 2. Ler TODAS as LPN do centro  (ZC_SDM_MOVLPN)
         * ────────────────────────────────────────────────────────────────*/
        this._loadMovLpnCentro(sCentro); // 2. Carga combinada MOVIMENTA + TRANSFERE
        const oMovOData = this.getOwnerComponent().getModel("MovLpn"); // modelo OData v2
        oMovOData.setSizeLimit(5000); // >100 linhas

        /* ────────────────────────────────────────────────────────────────
         * 3. Ler depósitos/posições válidos do centro (ZZ1_SDM_DEP_POS)
         * ────────────────────────────────────────────────────────────────*/
        const oDepOData = new sap.ui.model.odata.v2.ODataModel(
          "/sap/opu/odata/sap/ZSB_SDM_MOVIMENTA_LPN/"
        );
        const oParams = { $top: "5000" }; // sempre queremos limitar

        const mUrlParams = { $top: "5000" }; // limite sempre presente
        if (sCentro) {
          // adiciona o filtro se houver centro
          mUrlParams.$filter = `WERKS eq '${sCentro}'`;
        }
        oDepOData.read("/ZZ1_SDM_DEP_POS", {
          urlParameters: {
            $filter: sCentro ? `WERKS eq '${sCentro}'` : undefined,
            $top: "5000",
          },
          success: function (oData) {
            oView.setModel(
              new sap.ui.model.json.JSONModel(oData.results),
              "DepPostZZ1"
            );
            this.onConcatenaSelect(); // roda se MovLpnCentro já estiver carregado
          }.bind(this),
          error: (err) => {
            sap.m.MessageToast.show("Erro ao carregar ZZ1_SDM_DEP_POS");
            console.error(err);
          },
        });

        /* ────────────────────────────────────────────────────────────────
         * 4. Roteamento padrão da Object View
         * ────────────────────────────────────────────────────────────────*/
        this.getRouter()
          .getRoute("object")
          .attachPatternMatched(this._onObjectMatched, this);
      },

      onConcatenaSelect: function () {
        const oView = this.getView();

        const oMov = oView.getModel("MovLpnCentro"); // todas as LPN do centro
        const oDep = oView.getModel("DepPostZZ1"); // depósitos/posições válidos

        /* espera os dois carregarem */
        if (!oMov || !oDep) {
          return;
        }

        const aMov = oMov.getData();
        const aDep = oDep.getData();

        /* ────────────────────────────────────────────────────────────────
         * 1. Soma de ocorrências por (Depósito, Posição)
         * ────────────────────────────────────────────────────────────────*/
        const oSomaPos = {};
        const oDepUnico = {};

        aDep.forEach((d) => {
          const chave = `${d.LGORT}-${d.POSIT}`;

          const qtd = aMov.filter(
            (m) =>
              m.centro === d.WERKS &&
              m.deposito_origem === d.LGORT &&
              m.posicao_origem === d.POSIT
          ).length;

          oSomaPos[chave] = (oSomaPos[chave] || 0) + qtd;

          if (!oDepUnico[d.LGORT]) {
            oDepUnico[d.LGORT] = { DEPOSITO: d.LGORT, TEXTO: d.LGORT };
          }
        });

        /* ────────────────────────────────────────────────────────────────
         * 2. Constrói arrays para os ComboBox
         * ────────────────────────────────────────────────────────────────*/
        const aPosicoes = Object.keys(oSomaPos)
          .map((k) => {
            const [DEP, POS] = k.split("-");
            return {
              DEPOSITO: DEP,
              POSICAO: POS,
              QUANT: oSomaPos[k],
              TEXTO: `${POS} - ${oSomaPos[k]}`,
            };
          })
          .sort((a, b) => a.POSICAO.localeCompare(b.POSICAO));

        const aDepositos = Object.values(oDepUnico).sort((a, b) =>
          a.DEPOSITO.localeCompare(b.DEPOSITO)
        );

        /* ────────────────────────────────────────────────────────────────
         * 3. Publica nos modelos usados pelos ComboBox
         * ────────────────────────────────────────────────────────────────*/
        oView.setModel(
          new sap.ui.model.json.JSONModel(aPosicoes),
          "PosDestinoConcat"
        );
        oView.setModel(
          new sap.ui.model.json.JSONModel(aPosicoes),
          "PosDestinoConcatFull"
        );
        oView.setModel(
          new sap.ui.model.json.JSONModel(aDepositos),
          "DepDestinoConcat"
        );
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

        // 2. limpa a escolha anterior de posição ✔
        var oPosCombo = oView.byId("idSelectPosDestino");
        if (oPosCombo) {
          oPosCombo.setSelectedKey(""); // remove seleção
          oPosCombo.setValue(""); // limpa texto visível (ComboBox)
        }
      },

      onAplicarButtonPress: function () {
        console.log("⏩ onAplicarButtonPress");

        const oView = this.getView();
        const oDepModel = oView.getModel("DepPostZZ1"); // ← lista oficial
        if (!oDepModel) {
          sap.m.MessageToast.show("Lista de depósitos não carregada");
          return;
        }
        const aDepValidos = oDepModel.getData(); // [{ LGORT, POSIT, … }]

        /* valores escolhidos no cabeçalho */
        const sDepDestino = oView
          .byId("idSelectHeaderDepDestino")
          .getSelectedKey();
        const sPosDestino = oView.byId("idSelectPosDestino").getSelectedKey();

        /* Regras básicas */
        if (!sDepDestino) {
          sap.m.MessageToast.show("Selecione o depósito destino");
          return;
        }
        if (!sPosDestino) {
          sap.m.MessageToast.show("Selecione a posição destino");
          return;
        }

        /* ───── Validação depósito + posição ───── */
        const bParValido = aDepValidos.some(
          (rec) => rec.LGORT === sDepDestino && rec.POSIT === sPosDestino
        );
        if (!bParValido) {
          sap.m.MessageBox.error(
            `A combinação depósito '${sDepDestino}' + posição '${sPosDestino}' ` +
              "não é permitida para o centro selecionado."
          );
          return; // ⚠️ aborta aplicação
        }

        /* ───── Aplicar aos itens marcados ───── */
        const oTable = oView.byId("objectTable");
        const aCtx =
          oTable.getSelectedContexts("SelecionadosParaTransporte") || [];

        aCtx.forEach(function (oCtx, i) {
          const sPath = oCtx.getPath();
          const oModel = oCtx.getModel();

          oModel.setProperty(sPath + "/deposito_destino", sDepDestino);
          oModel.setProperty(sPath + "/posicao_destino", sPosDestino);
        });

        sap.m.MessageToast.show("Destino aplicado às linhas selecionadas.");
        console.log("✅ Fim onAplicarButtonPress");
      },

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
      onSalvarPress: function () {
        const oFuncModel = this.getOwnerComponent().getModel("MovimentaLpn");
        const oTable = this.byId("objectTable");
        var modelAction = this.getView().getModel();
        var modelMaterialDocument = this.getView().getModel("materialDocumentModel");
        
        const aCtx = oTable.getBinding("items").getContexts();
        const fmtQty = (q) => String(Number(q).toFixed(3));
        
        let iOK = 0, iSkip = 0;
        
        // Separar itens por tipo de operação
        const aItemsTransferencia = []; // depósitos diferentes
        const aItemsPosicao = []; // mesmo depósito, só posição
        
        // 1. Primeiro loop: classificar e validar todos os itens
        for (const ctx of aCtx) {
          const oData = ctx.getObject();

          if (!oData || !oData.deposito_destino) {
            iSkip++;
            sap.m.MessageBox.error(`Deposito em Branco LPN ${oData.lpn}`);
            return;
          }

          const oItemData = {
            material: oData.material,
            lpn: oData.lpn,
            centro: oData.centro,
            deposito_origem: oData.deposito_origem,
            posicao_origem: oData.posicao_origem,
            deposito_destino: oData.deposito_destino,
            posicao_destino: oData.posicao_destino,
            lote_logistico: oData.lote_logistico,
            unidade_medida: oData.unidade_medida,
            quantidade: oData.quantidade,
            flgFree: oData.flgFree
          };

          if (oData.deposito_origem !== oData.deposito_destino && oData.flgFree !== "") {
            aItemsTransferencia.push(oItemData);
          } else {
            aItemsPosicao.push(oItemData);
          }
          iOK++;
        }

        // 2. Processar transferências (depósitos diferentes) - UMA única chamada
        if (aItemsTransferencia.length > 0) {
          const materialDocumentWithItems = {
            MaterialDocument: "",
            GoodsMovementCode: "04",
            to_MaterialDocumentItem: {
              results: aItemsTransferencia.map(item => ({
                Material: item.material,
                Plant: item.centro,
                StorageLocation: item.deposito_origem,
                Batch: item.lote_logistico,
                GoodsMovementType: "311",
                IssgOrRcvgMaterial: item.material,
                IssgOrRcvgBatch: item.lote_logistico,
                IssuingOrReceivingPlant: item.centro,
                IssuingOrReceivingStorageLoc: item.deposito_destino,
                EntryUnit: item.unidade_medida,
                QuantityInEntryUnit: fmtQty(item.quantidade),
              }))
            },
          };

          modelMaterialDocument.create("/A_MaterialDocumentHeader", materialDocumentWithItems, {
            success: function (odata, response) {
              // Após criar documento material, atualizar posições
              this._updatePositions(oFuncModel, aItemsTransferencia, modelAction)
                .then(() => {
                  this._showSuccessMessage();
                })
                .catch((error) => {
                  this._showErrorMessage("Erro na atualização das posições após transferência", error);
                });
            }.bind(this),
            error: function (error, response) {
              this._showErrorMessage("Erro na criação do documento material", error);
            }.bind(this),
          });
        }

        // 3. Processar apenas mudanças de posição (mesmo depósito)
        if (aItemsPosicao.length > 0) {
          this._updatePositions(oFuncModel, aItemsPosicao, modelAction)
            .then(() => {
              if (aItemsTransferencia.length === 0) {
                this._showSuccessMessage();
              }
            })
            .catch((error) => {
              this._showErrorMessage("Erro na atualização das posições", error);
            });
        }

        // 4. Mostrar mensagem se não houver itens processados
        if (aItemsTransferencia.length === 0 && aItemsPosicao.length === 0) {
          const sMsg = iOK === 0
            ? "Nenhuma LPN com depósito destino preenchido para processar."
            : `Processadas ${iOK} LPN(s).` + (iSkip ? ` ${iSkip} ignorada(s) sem depósito destino.` : "");
          sap.m.MessageToast.show(sMsg);
        }
      },

      _updatePositions: function (oFuncModel, aItems, modelAction) {
        return new Promise((resolve, reject) => {
          let iProcessed = 0;
          let iErrors = 0;
          const iTotal = aItems.length;

          if (iTotal === 0) {
            resolve();
            return;
          }

          aItems.forEach((item) => {
            oFuncModel.callFunction("/transferir_lpn", {
              method: "POST",
              groupId: "transferirLpn",
              urlParameters: {
                material: item.material,
                lpn: item.lpn,
                centro: item.centro,
                deposito_origem: item.deposito_origem,
                posicao_origem: item.posicao_origem,
                deposito_destino: item.deposito_destino,
                posicao_destino: item.posicao_destino,
              },
              success: () => {
                iProcessed++;
                if (iProcessed + iErrors === iTotal) {
                  if (iErrors === 0) {
                    resolve();
                  } else {
                    reject(new Error(`${iErrors} erros de ${iTotal} itens processados`));
                  }
                }
              },
              error: (oError) => {
                iErrors++;
                console.error(`Erro ao transferir LPN ${item.lpn}:`, oError);
                if (iProcessed + iErrors === iTotal) {
                  reject(new Error(`${iErrors} erros de ${iTotal} itens processados`));
                }
              },
            });
          });
        });
      },

      _showSuccessMessage: function () {
        sap.ui.core.BusyIndicator.hide();
        this.getView().setBusy(false);
        
        this.getOwnerComponent().getModel("MovLpn").refresh(true);
        
        sap.m.MessageBox.success("Operação realizada com sucesso!", {
          onClose: () => {
            sap.ui.getCore().getEventBus().publish("Worklist", "Refresh");
            this.onNavBack();
          }
        });
      },

      _showErrorMessage: function (sMessage, error) {
        sap.ui.core.BusyIndicator.hide();
        this.getView().setBusy(false);
        
        console.error(sMessage, error);
        sap.m.MessageBox.error(sMessage);
      },

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
        var oTable = oView.byId("objectTable");
        var aItems = oTable.getItems();

        aItems.forEach(function (oItem) {
          var aCells = oItem.getCells();
        });
      },

      /**
       * Lê as duas entidades, aplica merge + regras e publica em
       * "MovLpnCentro".
       */
      _loadMovLpnCentro: function (sCentro) {
        const oView = this.getView();
        const oOD = this.getOwnerComponent().getModel("MovLpn");
        oOD.setSizeLimit(5000);

        let aMov, aTra;
        const merge = () => {
          if (!aMov || !aTra) return;

          const oHash = {};
          aTra.forEach((t) => {
            oHash[`${t.lpn}-${t.centro}`] = t;
          });

          const aMerge = aMov.map((m) => {
            const t = oHash[`${m.lpn}-${m.centro}`] || {};

            const nEst = Number(m.quantidade || 0);
            const nQual = Number(m.stck_qualid || m.StckQuant || 0);
            const nTotal = nEst + nQual;
            const sDU = nQual > 0 ? "BLOQ." : "LIB.";

            return Object.assign({}, m, {
              deposito_origem: t.deposito_origem || m.deposito_origem,
              posicao_origem: t.posicao_origem || m.posicao_origem,
              deposito_destino: t.deposito_destino || m.deposito_destino,
              posicao_destino: t.posicao_destino || m.posicao_destino,
              quantidade: nTotal,
              DU: sDU,
            });
          });

          oView.setModel(new JSONModel(aMerge), "MovLpnCentro");
          this.onConcatenaSelect();
        };

        // 1. MOVIMENTA
        oOD.read("/ZCDS_SDM_MOVIMENTA_LPN", {
          urlParameters: {
            $filter: sCentro ? `centro eq '${sCentro}'` : undefined,
            $top: "5000",
          },
          success: (oData) => {
            aMov = oData.results;
            merge();
          },
          error: console.error,
        });

        // 2. TRANSFERE
        oOD.read("/ZCDS_SDM_TRANSFERE_LPN", {
          urlParameters: {
            $filter: sCentro ? `centro eq '${sCentro}'` : undefined,
            $top: "5000",
          },
          success: (oData) => {
            aTra = oData.results;
            merge();
          },
          error: console.error,
        });
      },

      _grava_deposito_distinto: function (sCentro) {
      },
    });
  }
);
