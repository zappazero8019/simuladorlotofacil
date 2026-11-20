# Simulador Lotofácil

## 1. Apresentação

**Simulador Lotofácil** é um aplicativo recreativo que reproduz, de forma educativa e
totalmente fictícia, o fluxo de apostas da Lotofácil: escolha de dezenas, compra de
bilhetes, sorteio animado, conferência, prêmios, saldo, histórico e estatísticas.

Todo o dinheiro, saldo e premiação são **fictícios**. O aplicativo **não realiza
apostas reais**, não cobra nem paga valores e **não está associado à Caixa Econômica
Federal**. Nenhuma função de compra, pagamento ou consulta a resultados oficiais está
implementada.

Versão atual: **1.0.0**. Branch principal: `main`.

---

## 2. Funcionalidades

### Sorteio e apresentação

- **Globo 3D** com exatamente 25 bolas numeradas de 01 a 25, mistura física e
  extração animada das 15 bolas sorteadas pela abertura superior.
- **Roleta alternativa** em grade de 15 posições, sem WebGL, com giro, suspense e
  revelação individual.
- Os dois modos recebem a **mesma sequência imutável**, gerada antes de qualquer
  animação; trocar de modo não gera novo resultado.
- Ritmos **normal**, **acelerado** e **instantâneo**, além de controle de velocidade
  (`0,5×` a `5×`) alterável durante a apresentação.
- Pausa, continuar, próximo número, revelar todos e reiniciar apresentação.
- **Destaque dos acertos do primeiro bilhete durante a extração**: anel verde nas
  bolas, brilho verde nos slots e nas células da roleta, mantidos até o reset da
  extração. Os demais bilhetes mantêm apresentação normal.
- **Contador em tempo real dos acertos do primeiro bilhete**, com forma singular e
  plural (`1 número sorteado`, `2 números sorteados`). Ele é apenas visual: a
  conferência final continua sendo feita pelo motor matemático.
- **Mensagem final** informando `BILHETE CONTEMPLADO!`, `N BILHETES CONTEMPLADOS!`
  ou `NENHUM BILHETE CONTEMPLADO.`, com resultados individuais consultáveis quando
  há mais de um contemplado. A mensagem permanece aberta até o botão **Fechar**.

### Apostas e conferência

- Volante 5 × 5 (01–25) para bilhetes de **15 a 20 números**; Surpresinha e limpeza
  de seleção.
- **Quantidade ilimitada de bilhetes**: cada compra gera um registro próprio,
  inclusive bilhetes idênticos. A aba Apostas mostra os 50 bilhetes mais recentes
  e orienta a consultar o Histórico para a listagem completa, onde há paginação.
- **Teimosinha** em 2, 3, 4, 6, 8, 9, 12, 18 ou 24 concursos.
- **Bolões fictícios** de 2 cotas até o limite oficial por quantidade de números,
  com rateio simulado e resíduo na última cota.
- **Conferência automática** ao concluir cada sorteio, além do botão de conferência
  manual.

### Finanças, histórico e configurações

- Premiações e **saldo fictícios** em centavos inteiros, com ledger por bilhete e
  por prêmio, sem dupla contagem.
- **Histórico** de concursos e bilhetes com filtros, gráficos de evolução,
  indicadores e **estatísticas** descritivas (sem previsões).
- **Backup e restauração**: exportação JSON versionada de todas as stores,
  relatório CSV do ledger e importação por mesclagem validada com confirmação
  explícita. `meta` (concurso/sequência) e `settings` são restaurados do backup.
  A substituição completa do banco não está exposta na interface.
- **Reset completo da simulação** em Configurações, protegido por confirmação com
  digitação de `REINICIAR`; apaga somente as stores de simulação e preserva
  preferências e configurações.

### Áudio e experiência

- **Música de fundo contínua e calma**, procedural (Web Audio API), iniciada no
  primeiro gesto do usuário e não reiniciada a cada sorteio.
- Efeitos sonoros procedurais, incluindo um **som exclusivo para o acerto do
  primeiro bilhete**, distinto do som de extração.
- **Controles independentes** de música e efeitos (ligar/desligar e volume).
- **Mensagens de premiação persistentes** até fechamento manual; sem ocultação
  automática.
- **Modo de teste** opcional (1–100%) com RNG independente do sorteio. Resultados
  simulados não alteram prêmio, saldo, histórico ou estatísticas e exibem sempre
  `SIMULAÇÃO DE TESTE — NÃO É UM PRÊMIO REAL`.
- Responsividade para celular, `prefers-reduced-motion`, acessibilidade e PWA
  instalável (manifesto, ícone e service worker versionado).
- Versão **Android via Capacitor**, com o mesmo código e as mesmas regras da web.

---

## 3. Regras matemáticas e econômicas

O motor em `src/core/` é puro: não depende de DOM, animação, áudio, persistência ou
rede. Os geradores de aleatoriedade são injetáveis para testes determinísticos.

- Universo: números de **1 a 25**.
- Sorteio: **15 números distintos, sem reposição**. Total de resultados possíveis:
  **C(25,15) = 3.268.760**.
- Bilhetes: **15 a 20 números**.

### Preços oficiais por bilhete

| Números | Preço | Apostas simples |
| ---: | ---: | ---: |
| 15 | R$ 3,50 | 1 |
| 16 | R$ 56,00 | 16 |
| 17 | R$ 476,00 | 136 |
| 18 | R$ 2.856,00 | 816 |
| 19 | R$ 13.566,00 | 3.876 |
| 20 | R$ 54.264,00 | 15.504 |

### Faixas de premiação

- **11, 12 e 13 acertos:** valores fixos oficiais de **R$ 7,00**, **R$ 14,00** e
  **R$ 35,00**.
- **14 e 15 acertos:** dependem de rateio real; como o simulador não consulta a
  CAIXA, usa referências centralizadas e fictícias: **R$ 1.896,35** e
  **R$ 500.000,00**. O **teto de 15 acertos é configurável**; a referência de 14
  também existe no serviço. Valores são congelados na compra e na conferência, de
  modo que alterações posteriores não recalculam resultados antigos.
- **Teto configurado ≠ prêmio efetivamente recebido:** a configuração define apenas
  o limite usado na simulação. A mensagem, a intensidade dos efeitos e o valor
  creditado consideram o **valor efetivamente recebido** na conferência.

### Probabilidades

Para uma aposta com `k` números, a quantidade de sorteios com exatamente `x` acertos
é `C(k,x) × C(25−k,15−x)`, e a probabilidade é esse valor dividido por
`C(25,15)`. As faixas premiadas são `x ∈ {11,12,13,14,15}`.

Os valores exatos (`draws`, `totalDraws`, `probability` e `oneIn`) nunca são
arredondados. A formatação `1 em N` reproduz a tabela publicada pela CAIXA nas 30
células (6 modalidades × 5 faixas), inclusive duas exceções de arredondamento
(17 números/11 acertos e 18 números/11 acertos). A formatação altera apenas a
string exibida, nunca o cálculo.

Todo saldo, prêmio e limite é **fictício** e existe apenas dentro do navegador ou
do aplicativo Android.

---

## 4. Tecnologias

Conferidas em `package.json` e na estrutura do repositório:

| Camada | Tecnologia |
| --- | --- |
| Linguagem | JavaScript moderno (ES Modules) |
| Build | Vite 8.3.8 |
| Marcação e estilos | HTML5 e CSS3 |
| Visualização 3D | Three.js 0.187 |
| Áudio | Web Audio API (procedural, sem arquivos externos) |
| Persistência | IndexedDB (com fallback em memória) |
| Testes | Vitest 5.1.1 |
| PWA | Web App Manifest e Service Worker |
| Android | Capacitor 8.6.2, `@capacitor/app` 8.1.2 e Android WebView |
| Ambiente | Node.js `>=22.12.0` |

Não há backend, API externa, banco remoto nem dependências de pagamento.

---

## 5. Como executar localmente

No PowerShell, na pasta do projeto:

```powershell
npm.cmd install
npm.cmd run dev
```

Scripts disponíveis em `package.json`:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Auditoria de dependências (comando embutido do npm, não um script do `package.json`):

```powershell
npm.cmd audit
```

- `dev`: servidor de desenvolvimento (Vite).
- `build`: gera o bundle de produção em `dist/`.
- `preview`: serve localmente o conteúdo de `dist/`.
- `test`: executa a suíte completa com Vitest em modo `run`.
- `audit`: auditoria de dependências do npm.

---

## 6. Versão Android

- **Identificador:** `com.zappazero8019.simuladorlotofacil`
- **Nome:** Simulador Lotofácil
- **Versão:** `versionName = 1.0.0`, `versionCode = 1`
- **SDKs:** `minSdk 24`, `compileSdk 36`, `targetSdk 36`

### Requisitos de build

- JDK 21 (JDK 17 falha com `invalid source release: 21`).
- Android SDK instalado e variáveis `ANDROID_HOME` / `ANDROID_SDK_ROOT` apontando
  para ele.
- Node.js e dependências já instaladas na raiz do projeto.

### Comandos

```powershell
npm.cmd run build
npx.cmd cap sync android

$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
$env:ANDROID_HOME='C:\Users\<seu-usuario>\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME

cd android
.\gradlew.bat assembleDebug --no-daemon --console=plain
```

O APK de depuração é gerado em:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

Trata-se de um **APK debug, não assinado para distribuição**. Não é uma versão
publicada na Play Store; publicação, versão assinada e deploy exigem autorização
específica.

---

## 7. Testes e qualidade

Reexecutados nesta finalização:

| Verificação | Resultado |
| --- | --- |
| `npm.cmd test` | **40 arquivos de teste, 333 testes aprovados** |
| `npm.cmd run build` | OK — 79 módulos transformados, sem erros |
| `npm.cmd audit` | **0 vulnerabilidades** |
| `gradlew assembleDebug` | **BUILD SUCCESSFUL** (JDK 21) |

O build Android foi executado com o mesmo `dist/` da versão web e conferido por
`aapt dump badging`: pacote `com.zappazero8019.simuladorlotofacil`, rótulo
`Simulador Lotofácil`, `versionName=1.0.0`, `versionCode=1`, `minSdk 24` e
`targetSdk 36`.

---

## 8. Estrutura do projeto

```text
index.html              entrada HTML
vite.config.js          configuração do Vite
package.json            scripts, dependências e versão
public/                 manifesto PWA, service worker, ícone e robots.txt
src/
  main.js               ponto de entrada da aplicação
  styles.css            estilos globais
  androidBridge.js      integração nativa opcional (somente no APK)
  core/                 regras puras: constantes, combinatória, amostragem,
                        validação e probabilidades
  bets/                 preços, volante, cadastro, Teimosinha, bolões,
                        registro e conferência
  draws/                sessão com resultado congelado, apresentação, ritmos e
                        rastreador visual do primeiro bilhete
  prizes/               faixas e valores simulados
  finance/              ledger e saldo fictício em centavos
  history/              serviço de histórico de concursos e bilhetes
  statistics/           indicadores e estatísticas
  persistence/          IndexedDB, esquema, IDs, backup e restauração
  settings/             preferências de áudio e modo de teste
  results/              planejamento puro das mensagens de resultado
  audio/                motor procedural, efeitos e trilha contínua
  visualization/        globo 3D, bolas, física, mistura e extração
  ui/                   interface: navegação, apostas, roleta, histórico,
                        gráficos, preferências e mensagens
android/                projeto Android gerado pelo Capacitor
tests/                  suíte Vitest
docs/                   arquitetura, planos de fase e homologação
graphify-out/           placeholder para saídas locais do Graphify
                        (atualmente apenas .gitkeep; ver docs/GRAPHIFY.md)
```

Com exceção de `src/settings/`, os diretórios de domínio expõem um `index.js`
como ponto de entrada. As regras em
`src/core/`, `src/bets/`, `src/draws/` e `src/prizes/` são puras; a interface em
`src/ui/` apenas consome esses módulos.

---

## 9. Limitações

- O **teste físico mais recente no Moto G35 / Android 15 continua pendente**:
  `adb devices` não listou dispositivo. Portanto, áudio real, desempenho em
  hardware, teclado/rotação e suspensão em Android não podem ser afirmados como
  validados em dispositivo.
- A substituição completa do banco na restauração de backup não está exposta; a
  importação disponível é por mesclagem validada.
- A Fase 10 (publicação, versão assinada e distribuição) **não foi iniciada**.

Para detalhes de implementação e homologação, consulte a pasta [`docs/`](docs/).
