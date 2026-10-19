# Radar CS para computador

Programa de desktop (Windows e Mac) com o Radar CS dentro. Fica na barra do sistema, pode abrir com o computador e guarda seus dados no próprio computador.

## Como gerar o instalador (uma vez)

1. Crie uma conta gratuita em github.com e entre nela.
2. Clique em **New repository**, dê o nome `radar-cs`, marque **Private** e crie.
3. Na página do repositório vazio, clique em **uploading an existing file** e arraste TODO o conteúdo desta pasta (inclusive a pasta oculta `.github`). Se a `.github` não subir, me avise: eu envio o arquivo para você por outro caminho.
4. Clique em **Commit changes**.
5. Abra a aba **Actions**, escolha **Gerar instaladores** e clique em **Run workflow**.
6. Espere uns 5 a 10 minutos. Quando ficar verde, abra a execução e baixe, em **Artifacts**, o arquivo do seu sistema: `radar-cs-windows-latest` (instalador .exe) ou `radar-cs-macos-latest` (.dmg).

## Instalar

- **Windows:** abra o .exe. Se aparecer "O Windows protegeu o computador", clique em **Mais informações** e depois em **Executar assim mesmo** (o instalador ainda não tem assinatura paga).
- **Mac:** abra o .dmg e arraste para Aplicativos. Na primeira vez, clique com o botão direito no app, **Abrir**, e confirme.

## Uso

- Fechar a janela não encerra o programa: ele continua na barra do sistema (relógio no Windows, barra de menu no Mac). Para sair de vez, use o ícone, **Sair de vez**.
- No ícone você liga ou desliga **Abrir com o computador**.
- Seus dados ficam só neste computador. Use **Configurações, Seus dados, Baixar backup** com frequência.
- Para passar dados da versão do navegador, baixe o backup lá e use **Restaurar backup** aqui.

## Para desenvolvedores

`npm install` e `npm start` rodam o programa; `npm run dist` gera o instalador do sistema atual.

## Atualização automática

O programa confere, ao abrir e a cada 3 horas, se há uma versão nova da ferramenta em `radar-cs-desktop/app/` (arquivos `index.html` e `version.json`). Se houver, baixa, confere a integridade e pergunta se quer atualizar. Os dados não são tocados. Também dá para pedir pelo ícone da barra do sistema: **Verificar atualização agora**.

Só mudanças na "casca" do programa (`main.js`, `updater.js`, `package.json`, pasta `build`) geram um instalador novo, automaticamente, em **Releases**.
