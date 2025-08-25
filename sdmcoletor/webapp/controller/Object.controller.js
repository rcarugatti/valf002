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
        oMovOData.setSizeLimit(50000); // >100 linhas

        /* ────────────────────────────────────────────────────────────────
         * 3. Ler depósitos/posições válidos do centro (ZZ1_SDM_DEP_POS)
         * ────────────────────────────────────────────────────────────────*/
        const oDepOData = new sap.ui.model.odata.v2.ODataModel(
          "/sap/opu/odata/sap/ZSB_SDM_MOVIMENTA_LPN/"
        );
        const oParams = { $top: 50000 }; // sempre queremos limitar

        const mUrlParams = { $top: 50000 }; // limite sempre presente
        if (sCentro) {
          // adiciona o filtro se houver centro
          mUrlParams.$filter = `WERKS eq '${sCentro}'`;
        }
        oDepOData.read("/ZZ1_SDM_DEP_POS", {
          urlParameters: {
            $filter: sCentro ? `WERK eq 0${sCentro}'` : undefined,
            $top: 50000,
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
        
        // Obter o contexto da linha atual para pegar o lote_sdm
        var oContext = oItem.getBindingContext("SelecionadosParaTransporte");
        var sLoteSdm = oContext ? oContext.getProperty("lote_sdm") : "";
        
        // Calcular as opções com contagem dinâmica baseada no lote_sdm
        var aPosicoesDinamicas = this._calcularPosicoesDinamicas(sDepositoSelecionado, sLoteSdm);

        var oModelFiltrado = new JSONModel(aPosicoesDinamicas);
        oSelectPosicao.setModel(oModelFiltrado);
        oSelectPosicao.bindItems(
          "/",
          new sap.ui.core.Item({
            key: "{POSICAO}",
            text: "{TEXTO}",
          })
        );
      },

      /**
       * Calcula as posições com contagem dinâmica baseada no lote_sdm da linha atual
       * @param {string} sDepositoSelecionado  Depósito filtrado (pode vir vazio)
       * @param {string} sLoteSdm             Lote SDM da linha atual
       * @returns {Array}                     Lista de itens {DEPOSITO, POSICAO, QUANT, TEXTO}
       */
_calcularPosicoesDinamicas: function (sDepositoSelecionado, sLoteSdm) {
  const oView        = this.getView();
  const oMovLpnModel = oView.getModel("MovLpnCentro");
  const aMovLpn      = oMovLpnModel ? oMovLpnModel.getData() : [];      // universo completo
  const aTodasOpcoes = oView.getModel("PosDestinoConcatFull").getData();

  // 1. Aplica filtro por depósito (caso o usuário tenha escolhido um)
  const aFiltradas = sDepositoSelecionado
    ? aTodasOpcoes.filter((it) => it.DEPOSITO === sDepositoSelecionado)
    : aTodasOpcoes;

  // 2. Para cada posição destino, calcula:
  //    • iContLoteSdm  → Qtde de LPNs (já existentes) com mesmo lote_sdm nessa posição
  //    • iTotalDisponivelPosicao → Qtde total de LPNs na posição‑origem correspondente
  return aFiltradas.map((oPosicao) => {
    /* ------------------------------------------------------------------ *
     * 2.1 Quantas LPNs do MESMO LOTE já estão previstas para esta posição *
     * ------------------------------------------------------------------ */
    const iContLoteSdm = aMovLpn.filter((m) => {
      return (
        m.lote_sdm         === sLoteSdm &&
        m.posicao  === oPosicao.POSICAO &&
        (!sDepositoSelecionado || m.deposito === sDepositoSelecionado)
      );
    }).length;

    /* ------------------------------------------------------------------ *
     * 2.2 Total disponível na posição‑origem                              *
     * ------------------------------------------------------------------ */
    let iTotalDisponivelPosicao = aMovLpn.filter((m) => {
      return (
        m.deposito_origem === oPosicao.DEPOSITO &&
        m.posicao_origem  === oPosicao.POSICAO
      );
    }).length;

    // fallback para quando o merge ainda não trouxe o total
    if (iTotalDisponivelPosicao === 0) {
      iTotalDisponivelPosicao = oPosicao.QUANT || 0;
    }

    /* ------------------------------------------------------------------ */
    return {
      DEPOSITO : oPosicao.DEPOSITO,
      POSICAO  : oPosicao.POSICAO,
      QUANT    : iTotalDisponivelPosicao,
      TEXTO    : `${oPosicao.POSICAO} - ${iContLoteSdm} / ${iTotalDisponivelPosicao}`,
    };
  });
},




      onChangeposicaoDestino: function (oEvent) {
        console.log("🔄 onChangeposicaoDestino - Posição destino selecionada na tabela");
        
        var oSelectPosicao = oEvent.getSource();
        var sPosicaoSelecionada = oSelectPosicao.getSelectedKey();
        
        console.log("📍 Posição selecionada:", sPosicaoSelecionada);
        
        // Atualizar as contagens de todas as ComboBoxes da tabela
        setTimeout(function () {
          this._refreshAllTableComboBoxes();
        }.bind(this), 100); // Pequeno delay para garantir que o binding foi atualizado
      },

      /**
       * Atualiza todas as ComboBoxes de posição na tabela com contagens dinâmicas
       */
      _refreshAllTableComboBoxes: function () {
        var oView = this.getView();
        var oTable = oView.byId("objectTable");
        
        if (!oTable) {
          return;
        }

        var aItems = oTable.getItems();
        
        aItems.forEach(function (oItem) {
          var oContext = oItem.getBindingContext("SelecionadosParaTransporte");
          if (!oContext) {
            return;
          }

          var sLoteSdm = oContext.getProperty("lote_sdm");
          var sDepositoDestino = oContext.getProperty("deposito_destino");
          
          // Encontrar o ComboBox de posição na linha
          var aCells = oItem.getCells();
          var oSelectPosicao = aCells.find(function (cell) {
            return cell.getId && cell.getId().includes("idSelectPosDest");
          });

          if (oSelectPosicao && sLoteSdm) {
            // Calcular as opções com contagem dinâmica
            var aPosicoesDinamicas = this._calcularPosicoesDinamicas(sDepositoDestino, sLoteSdm);
            
            // Atualizar o modelo do ComboBox
            var oModelDinamico = new JSONModel(aPosicoesDinamicas);
            oSelectPosicao.setModel(oModelDinamico);
            oSelectPosicao.bindItems(
              "/",
              new sap.ui.core.Item({
                key: "{POSICAO}",
                text: "{TEXTO}",
              })
            );
          }
        }.bind(this));
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
        const aCtx = oTable.getSelectedContexts() || [];

        // Debug: verificar quantos itens foram selecionados
        console.log(`📊 Contextos selecionados: ${aCtx.length}`);

        if (aCtx.length === 0) {
          sap.m.MessageToast.show("Nenhuma linha selecionada. Selecione as linhas que deseja aplicar o destino.");
          return;
        }

        let iAplicados = 0;
        let iErros = 0;
        const aTodasOpcoes = oView.getModel("PosDestinoConcatFull").getData();

        aCtx.forEach(function (oCtx, i) {
          try {
            // Verificações de segurança
            if (!oCtx) {
              console.warn(`⚠️ Contexto ${i} é nulo`);
              iErros++;
              return;
            }

            const sPath = oCtx.getPath();
            const oModel = oCtx.getModel();

            if (!oModel) {
              console.warn(`⚠️ Modelo não encontrado para contexto ${i}`);
              iErros++;
              return;
            }

            if (!sPath) {
              console.warn(`⚠️ Path não encontrado para contexto ${i}`);
              iErros++;
              return;
            }

            // Verificar se o path existe no modelo
            const oData = oModel.getProperty(sPath);
            if (!oData) {
              console.warn(`⚠️ Dados não encontrados no path ${sPath}`);
              iErros++;
              return;
            }

            // Encontrar e atualizar o ComboBox de posição antes de aplicar o valor
            const aItems = oTable.getItems();
            const oItem = aItems.find(item => item.getBindingContext("SelecionadosParaTransporte")?.getPath() === sPath);
            if (oItem) {
              const oSelectPos = oItem.getCells().find(cell => cell.getId().includes("idSelectPosDest"));
              if (oSelectPos) {
                const aFiltradas = aTodasOpcoes.filter(item => item.DEPOSITO === sDepDestino);
                oSelectPos.setModel(new JSONModel(aFiltradas));
                oSelectPos.bindItems("/", new sap.ui.core.Item({ key: "{POSICAO}", text: "{TEXTO}" }));
              }
            }

            // Aplicar os valores
            oModel.setProperty(sPath + "/deposito_destino", sDepDestino);
            oModel.setProperty(sPath + "/posicao_destino", sPosDestino);

            // Verificar se foi aplicado corretamente
            const sDepAplicado = oModel.getProperty(sPath + "/deposito_destino");
            const sPosAplicada = oModel.getProperty(sPath + "/posicao_destino");

            if (sDepAplicado === sDepDestino && sPosAplicada === sPosDestino) {
              iAplicados++;
              console.log(`✅ Aplicado com sucesso - Linha ${i}: ${sDepDestino}/${sPosDestino}`);
            } else {
              console.warn(`⚠️ Falha na aplicação - Linha ${i}: esperado ${sDepDestino}/${sPosDestino}, obtido ${sDepAplicado}/${sPosAplicada}`);
              iErros++;
            }

          } catch (error) {
            console.error(`❌ Erro ao processar contexto ${i}:`, error);
            iErros++;
          }
        });

        // Forçar refresh do modelo para garantir que as mudanças sejam refletidas
        const oSelecionadosModel = oView.getModel("SelecionadosParaTransporte");
        if (oSelecionadosModel) {
          oSelecionadosModel.refresh();
        }

        // Atualizar todas as ComboBoxes da tabela com as novas contagens
        this._refreshAllTableComboBoxes();

        // Mensagem de resultado
        if (iAplicados > 0) {
          const sMsg = iErros > 0 
            ? `Destino aplicado a ${iAplicados} linha(s). ${iErros} erro(s) encontrado(s).`
            : `Destino aplicado a ${iAplicados} linha(s) selecionada(s).`;
          sap.m.MessageToast.show(sMsg);
        } else {
          sap.m.MessageBox.error("Não foi possível aplicar o destino a nenhuma linha. Verifique o console para mais detalhes.");
        }
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
        var modelMaterialDocument = this.getView().getModel("materialDocumentModel");
        
        // Estrutura API Documento Material
        var materialDocumentWithItems = {
          MaterialDocument: "",
          GoodsMovementCode: "04",
          to_MaterialDocumentItem: {
            results: [],
          },
        };
        
        // Estrutura para chamada Atualizar CBOs
        var updateCboPosicao = {
          results: [],
        };
        
        // Array para armazenar todos os itens que serão processados
        var aItensProcessados = [];
        
        const aCtx = oTable.getBinding("items").getContexts();
        let iOK = 0, iSkip = 0;

        // Primeiro, processa todos os contextos e coleta os dados
        for (const ctx of aCtx) {
          const oData = ctx.getObject();

          if (!oData || !oData.deposito_destino) {
            iSkip++;
            sap.m.MessageBox.error(`Deposito em Branco LPN ${oData.lpn}`);
            return;
          }

          const fmtQty = (q) => String(Number(q).toFixed(3));

          // Se depósitos diferentes, adiciona ao documento material
          if (oData.deposito_origem !== oData.deposito_destino && oData.flgFree !== "") {
            materialDocumentWithItems.to_MaterialDocumentItem.results.push({
              Material: oData.material,
              Plant: oData.centro,
              StorageLocation: oData.deposito_origem,
              Batch: oData.lote_logistico,
              GoodsMovementType: "311",
              IssgOrRcvgMaterial: oData.material,
              IssgOrRcvgBatch: oData.lote_logistico,
              IssuingOrReceivingPlant: oData.centro,
              IssuingOrReceivingStorageLoc: oData.deposito_destino,
              EntryUnit: oData.unidade_medida,
              QuantityInEntryUnit: fmtQty(oData.quantidade),
            });
          }

          // Sempre adiciona aos CBOs para atualização de posição
          updateCboPosicao.results.push({
            material: oData.material,
            lpn: oData.lpn,
            centro: oData.centro,
            deposito_origem: oData.deposito_origem,
            posicao_origem: oData.posicao_origem,
            deposito_destino: oData.deposito_destino,
            posicao_destino: oData.posicao_destino,
          });

          // Adiciona o item completo ao array de processados
          aItensProcessados.push(oData);

          iOK++;
        }

        // Mostrar busy indicator
        sap.ui.core.BusyIndicator.show();

        // Agora executa as operações de forma sequencial
        this._processTransferOperations(
          materialDocumentWithItems,
          updateCboPosicao,
          oFuncModel,
          modelMaterialDocument,
          iOK,
          iSkip,
          aItensProcessados
        );
      },

      _processTransferOperations: function (
        materialDocumentWithItems,
        updateCboPosicao,
        oFuncModel,
        modelMaterialDocument,
        iOK,
        iSkip,
        aItensProcessados
      ) {
        // Se há itens para transferência entre depósitos diferentes
        if (materialDocumentWithItems.to_MaterialDocumentItem.results.length > 0) {
          modelMaterialDocument.create("/A_MaterialDocumentHeader", materialDocumentWithItems, {
            success: function (odata, response) {
              // Após criar o documento, processa as transferências de posição
              this._processLpnTransfers(updateCboPosicao, oFuncModel, iOK, iSkip, aItensProcessados);
            }.bind(this),
            error: function (error, response) {
              sap.ui.core.BusyIndicator.hide();
              var errorMessage = "Erro ao criar documento material";
              try {
                errorMessage = JSON.parse(error.responseText).error.innererror.errordetails[0].message;
              } catch (e) {
                console.error("Erro ao processar resposta de erro:", e);
              }
              sap.m.MessageBox.error(errorMessage);
            }.bind(this),
          });
        } else {
          // Se não há transferências entre depósitos, apenas processa posições
          this._processLpnTransfers(updateCboPosicao, oFuncModel, iOK, iSkip, aItensProcessados);
        }
      },

      _processLpnTransfers: function (updateCboPosicao, oFuncModel, iOK, iSkip, aItensProcessados) {
        if (updateCboPosicao.results.length === 0) {
          this._showFinalMessage(iOK, iSkip, []);
          return;
        }

        let processedCount = 0;
        let successCount = 0;
        const totalCount = updateCboPosicao.results.length;
        const aItensComSucesso = [];

        updateCboPosicao.results.forEach((element, index) => {
          oFuncModel.callFunction("/transferir_lpn", {
            method: "POST",
            groupId: "transferirLpn",
            urlParameters: {
              material: element.material,
              lpn: element.lpn,
              centro: element.centro,
              deposito_origem: element.deposito_origem,
              posicao_origem: element.posicao_origem,
              deposito_destino: element.deposito_destino,
              posicao_destino: element.posicao_destino,
            },
            success: function (oData, response) {
              processedCount++;
              successCount++;
              console.log(`LPN ${element.lpn} processada com sucesso (${processedCount}/${totalCount})`);
              
              // Adiciona o item processado com sucesso ao array
              aItensComSucesso.push(aItensProcessados[index]);
              
              // Se todas as transferências foram processadas
              if (processedCount === totalCount) {
                this._onAllTransfersComplete(iOK, iSkip, aItensComSucesso, successCount);
              }
            }.bind(this),
            error: function (oError) {
              processedCount++;
              console.error(`Erro ao processar LPN ${element.lpn}:`, oError);
              sap.m.MessageToast.show(`Erro ao processar LPN ${element.lpn}`);
              
              // Mesmo com erro, verifica se todas foram processadas
              if (processedCount === totalCount) {
                this._onAllTransfersComplete(iOK, iSkip, aItensComSucesso, successCount);
              }
            }.bind(this),
          });
        });
      },

      _onAllTransfersComplete: function (iOK, iSkip, aItensComSucesso, successCount) {
        sap.ui.core.BusyIndicator.hide();
        
        // Força refresh do modelo
        this.getOwnerComponent().getModel("MovLpn").refresh(true);
        
        // Cria modelo com os itens processados com sucesso para enviar à Worklist
        const oItensProcessadosModel = new sap.ui.model.json.JSONModel({
          itensProcessados: aItensComSucesso,
          totalProcessados: successCount,
          timestamp: new Date()
        });
        
        // Armazena no Core para a Worklist acessar
        sap.ui.getCore().setModel(oItensProcessadosModel, "ItensProcessadosComSucesso");
        
        // Mensagem de sucesso com informações detalhadas
        const sMsgSucesso = successCount === iOK 
          ? `Todas as ${successCount} transferências processadas com sucesso!`
          : `${successCount} de ${iOK} transferências processadas com sucesso.`;
        
        // Mostra mensagem de sucesso e navega de volta
        sap.m.MessageBox.success(sMsgSucesso, {
          onClose: function () {
            // Dispara evento para refresh da Worklist com os itens processados
            sap.ui.getCore().getEventBus().publish("Worklist", "RefreshWithProcessedItems", {
              itensProcessados: aItensComSucesso,
              totalProcessados: successCount,
              timestamp: new Date(),
              manterSelecionados: true // Flag para manter itens selecionados
            });
            
            // NÃO remove os itens do modelo SelecionadosParaTransporte
            // Eles devem permanecer para serem exibidos na Worklist atualizados
            
            // Navega de volta
            this.onNavBack();
          }.bind(this),
        });
      },

      /**
       * Remove os itens processados com sucesso do modelo SelecionadosParaTransporte
       */
      _removeProcessedItemsFromSelection: function (aItensComSucesso) {
        const oSelecionadosModel = sap.ui.getCore().getModel("SelecionadosParaTransporte");
        if (!oSelecionadosModel || !aItensComSucesso.length) {
          return;
        }

        const aSelecionados = oSelecionadosModel.getData();
        const aLpnsProcessadas = aItensComSucesso.map(item => item.lpn);
        
        // Filtra removendo os itens processados com sucesso
        const aFiltrados = aSelecionados.filter(item => !aLpnsProcessadas.includes(item.lpn));
        
        oSelecionadosModel.setData(aFiltrados);
        
        console.log(`📋 Removidos ${aLpnsProcessadas.length} itens processados com sucesso do modelo SelecionadosParaTransporte`);
      },

      _showFinalMessage: function (iOK, iSkip, aItensComSucesso) {
        sap.ui.core.BusyIndicator.hide();
        
        const sMsg =
          iOK === 0
            ? "Nenhuma LPN com depósito destino preenchido para processar."
            : `Processadas ${iOK} LPN(s).` +
              (iSkip ? ` ${iSkip} ignorada(s) sem depósito destino.` : "");

        sap.m.MessageToast.show(sMsg);
        
        // Se houver itens processados com sucesso, remove do modelo
        if (aItensComSucesso && aItensComSucesso.length > 0) {
          this._removeProcessedItemsFromSelection(aItensComSucesso);
        }
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
        //if (oHeaderSelect) {
        //  oHeaderSelect.setSelectedKey("CFQ");
        //  oHeaderSelect.setEnabled(!bBloqueado);
        //}
        if (oHeaderSelect) {
    if (bBloqueado) {
        /* Caso bloqueado: força CFQ e desabilita */
        oHeaderSelect.setSelectedKey("CFQ");
    } else {
        /* Caso liberado: limpa seleção para mostrar o placeholder */
        oHeaderSelect.setSelectedKey("");          // ou null
    }
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

        // Inicializar as ComboBoxes da tabela com contagens dinâmicas
        setTimeout(function () {
          this._refreshAllTableComboBoxes();
        }.bind(this), 500); // Delay par0a garantir que a tabela foi renderizada
      },

      /**
       * Lê as duas entidades, aplica merge + regras e publica em
       * "MovLpnCentro".
       */
      _loadMovLpnCentro: function (sCentro) {
        const oView = this.getView();
        const oOD = this.getOwnerComponent().getModel("MovLpn");
        oOD.setSizeLimit(50000);

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
            $top: 50000,
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
            $top: 50000,
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
