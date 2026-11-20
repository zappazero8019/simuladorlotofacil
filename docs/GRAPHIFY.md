# Graphify — integração e limitações

## Estado atual

| Item | Situação |
| --- | --- |
| Skill no OpenCode | Instalada no diretório de configuração do usuário |
| Versão da skill | `0.9.111` |
| Pacote Python instalado | `graphifyy==0.9.42` (Python 3.14) |
| Comando utilizável | `py -m graphify ...` |
| Executável no PATH | Não (`Scripts\graphify.exe` existe, mas não está no PATH) |
| Chaves Gemini/Google | Não configuradas |
| `graphify-out/graph.json` | Não existe |
| Execução na Fase 0 | Nenhuma — nenhum grafo ou relatório foi criado ou sobrescrito |

A skill 0.9.111 foi lida integralmente antes desta análise. O aviso emitido pelo
próprio pacote confirma a divergência:

```text
warning: skill is from graphify 0.9.111, but the package is 0.9.42 (older).
```

## Incompatibilidades identificadas

1. **Comandos de exportação.** A skill 0.9.111 usa `graphify export html` e
   `graphify export obsidian`. O CLI 0.9.42 expõe apenas `export callflow-html`;
   não há `export html` nem `export obsidian`.
2. **Forma de invocação.** O runbook da skill descreve um pipeline implícito
   `/graphify <path>` executado pelo agente. O pacote 0.9.42 expõe
   `extract <path>` (headless) com outra superfície de flags, como
   `--code-only`, `--no-cluster`, `--out` e `--force`.
3. **API ausente.** A etapa B3.5 da skill chama
   `graphify.cache.drop_unreported_chunk_sources`, que **não existe** no pacote
   0.9.42. Seguir o runbook literalmente quebraria essa etapa.
4. **Backend semantic padrão.** Em 0.9.42,
   `graphify.llm.extract_corpus_parallel` tem `backend='kimi'` por padrão,
   enquanto a skill assume Gemini (`gemini-3-flash-preview`). Sem
   `GEMINI_API_KEY`/`GOOGLE_API_KEY`, a extração semântica de documentos e
   imagens dependeria do próprio agente.
5. **Flags de topo diferentes.** Opções esperadas pela skill como `--wiki`,
   `--svg`, `--graphml`, `--neo4j`, `--falkordb`, `--mcp`, `--obsidian`,
   `--whisper-model`, `--no-viz`, `--directed` e `--mode deep` não estão todas
   disponíveis como flags de topo no CLI 0.9.42; equivalentes aparecem como
   subcomandos ou flags de `extract`/`cluster-only`.
6. **Nome de parâmetro.** `suggest_questions` usa `community_labels` no pacote
   0.9.42. A skill passa o argumento posicionalmente, então isso funciona, mas
   o nome difere da documentação implícita da skill.
7. **Sidecars do runbook.** A skill grava `.graphify_python` e `.graphify_root`
   em `graphify-out/`. Embora `out_path()` do pacote aponte para esse diretório,
   a compatibilidade integral do runbook não foi validada de ponta a ponta.

Após a instalação, as assinaturas das APIs usadas no runbook foram conferidas
por introspecção. `detect`, `extract`, `build_from_json`, `cluster`,
`report.generate` e `export.to_json` estão presentes e com parâmetros
compatíveis com o uso feito pela skill. As divergências acima são as que
realmente impediriam uma execução literal.

## O que foi preparado

- Diretório `graphify-out/` criado com `.gitkeep`, sem grafo nem relatório.
- `.gitignore` ignorando artefatos gerados, com exceção de `GRAPH_REPORT.md`
  para permitir versionamento futuro se a equipe decidir.
- Este documento registrando versões, limitações e procedimento seguro.

## Uso seguro recomendado

Enquanto o pacote 0.9.42 estiver instalado:

```bash
# conferir versão
py -m graphify --version

# quando houver código e um grafo já existir, prefira consultar:
py -m graphify query "<pergunta>" --graph graphify-out/graph.json

# para gerar um grafo code-only (quando autorizado):
py -m graphify extract . --code-only --no-cluster --out .
```

> O comando `extract` acima **grava** em `graphify-out/`. Ele não deve ser
> executado nesta fase e somente deve ser usado após autorização, verificando
> antes se já existe `graph.json`/`GRAPH_REPORT.md` a preservar.

## Pendência

Para usar o runbook completo da skill 0.9.111 sem adaptações, será necessário
atualizar o pacote `graphifyy` para a versão correspondente. **Isso não foi
feito**, pois dependências globais não podem ser atualizadas sem autorização.
Alternativamente, o runbook pode ser adaptado para os comandos do pacote
0.9.42 — também sujeito a aprovação.
