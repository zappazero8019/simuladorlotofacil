# Fase 8 — Aplicativo Android e geração de APK

Data: 20/11/2026. Versão web de referência: 1.0.0. Fase 9 não iniciada.

## 8A — Auditoria e decisão

### Ambiente detectado

| Item | Versão / caminho |
| --- | --- |
| Android Studio | AI-262.9437.185.2621.16467767 |
| SDK Android | `C:\Users\<seu-usuario>\AppData\Local\Android\Sdk` |
| Plataformas | `android-33`, `android-37.0` |
| Build Tools | `30.0.3`, `36.0.0` |
| Gradle | wrapper 8.14.3 baixado pelo projeto; Gradle local 8.5 |
| JDK usado no build | `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` |
| JDK rejeitado | 17 (Capacitor 8 exige `source release 21`); 25 (incompatível com Gradle) |
| ADB | presente no SDK, nenhum dispositivo conectado |
| Capacitor | core/cli/android 8.6.2; app 8.1.2 |

`ANDROID_HOME`/`ANDROID_SDK_ROOT` não estavam definidos globalmente. Foram
informados apenas no processo de build, sem alterar configurações do Windows.

### Comparação

| Critério | Capacitor | TWA | WebView nativa manual |
| --- | --- | --- | --- |
| Reusa bundle/dist e regras atuais | Sim | Sim, mas exige URL pública | Sim, com trabalho manual |
| Offline sem hospedagem | Sim, assets no APK | Não sem PWA hospedada | Sim |
| IndexedDB | Sim, origem segura `https://localhost` | Sim | Sim, exige configuração |
| WebGL/Three.js | Sim | Sim | Sim |
| Manifest/SW existentes | Mantidos no bundle | Obrigatórios e públicos | Podem ser mantidos |
| Dependências | 4 pacotes Capacitor | nenhuma npm, exige Asset Links | nenhuma npm |
| Manutenção | Baixa; `npx cap sync` | Média; depende de domínio | Alta; projeto nativo manual |
| Tamanho do APK | Moderado | Muito pequeno | Semelhante |
| Publicação | Não exigida | Exige Play Store/Asset Links | Não exigida |

### Decisão

Adotar **Capacitor 8.6.2** com `@capacitor/core`, `@capacitor/cli`,
`@capacitor/android` e `@capacitor/app@8.1.2`.

Justificativa: gera APK local instalável sem publicar o PWA, sem recriar regras
de negócio e sem manter projeto nativo manual. O Capacitor serve o bundle em
`https://localhost`, origem segura onde WebView moderno suporta IndexedDB,
Service Worker e WebGL. Mesmo se o SW não registrar, os assets estão embutidos
no APK e o aplicativo funciona offline. `@capacitor/app` trata voltar,
suspensão e retomada. TWA foi rejeitado por exigir domínio público e Digital
Asset Links; WebView manual pelo custo de manutenção e risco de divergência.

Nenhuma dependência foi adicionada ao motor matemático.

## 8B — Preparação Android

- Nome: **Simulador Lotofácil**.
- Pacote: `com.zappazero8019.simuladorlotofacil`.
- Ícone adaptativo e legado gerados a partir de `public/icone.svg` com a palette
  `#0f172a / #38bdf8 / #14b8a6`; splash substituído pelo mesmo ícone.
- Orientação livre (`unspecified`), compatível com `orientation: any` do PWA.
- Tema escuro (`#070b14`, `#101a2e`, acento `#14b8a6`), sem ActionBar;
  barras de status e navegação escuras com ícones claros (API 27+ tratada à
  parte).
- Safe areas já presentes no CSS via `env(safe-area-inset-*)` e
  `viewport-fit=cover`; `windowSoftInputMode="adjustResize"` para teclado virtual.
- Voltar: cancela o modal de reset, volta à aba Sorteio ou encerra o app com
  `App.exitApp()`.
- Ciclo de vida: ao suspender, pausa apenas a apresentação em andamento; ao
  retomar, reaplica somente se a pausa tiver sido causada pelo Android.
- Permissões: apenas `INTERNET` e a permissão interna do AndroidX para
  receivers dinâmicos. Sem câmera, localização, armazenamento, ADS ou rastreamento.

## 8C — Integração

O APK carrega o mesmo `dist/` da versão web; nenhuma regra, preço, premiação,
combinatória ou física foi duplicada. O módulo `src/androidBridge.js` é
carregado dinamicamente apenas quando `Capacitor.getPlatform() === 'android'`;
no navegador os chunks nativos nem são baixados.

## 8D — Persistência e offline

- IndexedDB continua sendo o banco primário; a origem no APK é estável
  (`https://localhost`), preservando bilhetes, concursos, finanças e preferências
  entre aberturas e atualizações com a mesma assinatura.
- `allowBackup="true"` preserva dados em reinstalações com o mesmo pacote.
- O shell do PWA permanece versionado por hash; nenhum dado da simulação vai
  para o Cache API. Offline do APK não depende do SW: os assets estão no APK.
- Reset continua restrito ao banco isolado/quando confirmado explicitamente;
  nenhum reset foi executado em banco real.

**Limitação:** sem dispositivo não foi possível comprovar em hardware a
sobrevivência dos dados após reinício do Android nem a atualização instalada
sobre versão anterior. O comportamento é garantido pelo projeto e pelo histórico
de testes web, mas precisa de validação física.

## 8E — Desempenho

Não houve dispositivo Android para medir carregamento, FPS, física, roleta,
teclado virtual, alternância de apps ou histórico com milhares de bilhetes.
Nenhuma medição foi inventada. A Fase 7 registrou ~0,9 s para estatísticas sobre
16 mil bilhetes em desktop; em hardware modesto pode haver jank. A roleta
continua como fallback automático quando WebGL não está disponível, sem alterar
matemática ou física.

## 8F — Build do APK

Comandos executados (variáveis apenas no processo):

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
$env:ANDROID_HOME='C:\Users\<seu-usuario>\AppData\Local\Android\Sdk'
npm.cmd run build
npx.cmd cap sync android
cd android
.\gradlew.bat assembleDebug --no-daemon
```

APK gerado:

- Caminho: `android/app/build/outputs/apk/debug/app-debug.apk`
- Tamanho: **5,07 MB** (5.315.852 bytes)
- `versionName`: **1.0.0**, `versionCode`: 1
- `minSdk`: 24, `targetSdk`: 36, `compileSdk`: 36
- Assinatura: depuração (não distribuir)

## 8G — Teste físico

`adb devices -l` retornou lista vazia. Nenhum Moto G35 foi conectado. **Nenhum
teste em hardware foi realizado nem afirmado.** Instalação, ícone, nome,
offline, atualização e preservação de dados em dispositivo permanecem pendentes.

## Resultado

- `npm test`: 30 arquivos, 240 testes OK (4 novos testes da ponte Android).
- `npm run build`: OK; chunks nativos apenas sob demanda.
- `npm audit`: 0 vulnerabilidades (confirmado na validação final).
- Navegador: sem erros, PWA ativa, SW/cache `5eFtc4aC`, nenhum chunk Capacitor
  carregado na web.
- Versão web 1.0.0 e Fases 0–7 preservadas. Nenhum commit, push, deploy,
  publicação ou Fase 9.

### Prontidão

APK de depuração **gerado e pronto para teste**. Não há homologação em hardware.
A pendência não bloqueia a versão web 1.0.0, mas impede afirmar que o aplicativo
Android foi validado no Moto G35.
