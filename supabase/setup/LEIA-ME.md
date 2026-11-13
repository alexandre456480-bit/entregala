# Executar os SQLs no Supabase

> Histórico da instalação inicial. As três fases já foram detectadas no projeto atual. Não reexecute criações já aplicadas. Para a conferência operacional, use [04_conferir_fase3.sql](04_conferir_fase3.sql) e consulte [FASE3.md](../../docs/FASE3.md).

Use o **mesmo projeto cujas chaves estão no `.env`**. Não é necessário fornecer `DATABASE_URL` para esse procedimento manual.

**Estado verificado ao final de 11/11/2026:** as oito tabelas deste projeto já estão presentes e a leitura anônima foi negada. Continue no passo 2; não execute o SQL de criação novamente. O passo 1 abaixo fica como referência para uma instalação nova.

1. Abra o **SQL Editor → New query**. Copie e execute **todo** o arquivo [01 — Estrutura da Fase 1](../migrations/20261111133155_phase1_core.sql). Ele usa transação, não insere demonstrações e não apaga tabelas existentes. Execute uma vez. Se surgir erro, a transação é revertida; não continue para os próximos passos sem corrigir a causa.
2. Abra **Authentication → Users → Add user** e crie seu usuário administrativo com e-mail e senha forte. Marque a confirmação de e-mail. Não utilize cadastro público.
3. Abra [02 — Primeiro administrador](02_primeiro_administrador.sql). Substitua `SUBSTITUA_PELO_SEU_EMAIL` e `SUBSTITUA_PELO_SEU_NOME` nas duas variáveis iniciais e execute todo o arquivo. A senha permanece no Auth e não entra no SQL.
4. Execute [03 — Conferência](03_conferir_instalacao.sql). Confira oito tabelas com RLS ativo e `administrador_pronto = true`.
5. Em **Authentication**, desative novos cadastros públicos e login anônimo. Configure Site URL para `http://localhost:4200` e Redirect URL para `http://localhost:4200/recuperar`. Para produção, use o domínio HTTPS definitivo e SMTP adequado.
6. Execute `npm run dev` e entre em http://localhost:4200 com seu usuário administrativo. Os motoristas são criados pela tela **Motoristas**; não é necessário SQL para cada um.
7. Execute `npm run verify:remote` para conferir a presença das tabelas e a negação de leitura anônima, sem criar dados. Depois homologue com clientes/pedidos próprios e dois motoristas.

O arquivo 01 é a migration oficial. Se aplicá-lo manualmente e posteriormente quiser usar `npm run db:migrate`/CLI, registre primeiro essa versão no histórico de migrations; evite reaplicar a criação de tabelas. O script de instalação não é idempotente propositalmente: uma tabela preexistente com estrutura incompatível deve interromper a instalação.

Se o SQL Editor mostrar uma transação abortada após erro, execute `ROLLBACK;`, confira o erro original e execute novamente o arquivo inteiro após corrigir a causa.
