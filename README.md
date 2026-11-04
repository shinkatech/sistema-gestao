# ServiOS

Sistema local de gestão para oficina: ordens de serviço, cadastros, contas a pagar, contas a receber, relatórios e backup.

## Requisitos

- Node.js 22 ou superior

## Como abrir

```bash
npm install
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173).

A API fica em [http://localhost:3333](http://localhost:3333). Os dados são gravados em `server/data/gestao.db`.

## Backup

Com o sistema aberto, uma cópia é criada ao iniciar e repetida a cada 12 horas. Também é possível gerar, baixar e restaurar cópias na aba Backup. Os arquivos ficam em `server/data/backups`.

## Uso no dia a dia

Cada módulo abre em uma aba. Dá para preencher uma ordem de serviço e abrir clientes, veículos ou outro cadastro sem perder o que já foi digitado.
