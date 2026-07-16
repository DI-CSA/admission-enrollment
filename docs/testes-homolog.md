cgoudouris@gmail.com - 878.087.260-36
    Filho cgoudouris - 514.268.580-60
    Financeiro - 128.913.770-60
    Senha: 10IK22yL1w

cesar.goudouris@gmail.com - 091.789.060-40
    Filho cesar.goudouris - 036.709.990-00

Diogo: 157.378.507-57 
Senha: kaizer

## Simular login como um usuário (troca temporária de senha)

Para testar o portal como um usuário específico sem saber a senha dele. Faz
backup do hash ORIGINAL, grava uma senha conhecida e depois restaura. Rodar a
partir de `plataforma/` (o `--env-file` define o banco: `.env.local`).

```bash
cd plataforma

# 1) troca a senha do CPF por uma conhecida (salva o hash original em backup)
node --env-file=.env.local scripts/simular-login.mjs 04812275636 asc321

# 2) logue no portal com esse CPF e a senha "asc321" e faça os testes

# 3) restaura o hash original e apaga o backup
node --env-file=.env.local scripts/restaurar-login.mjs 04812275636
```

- Em PRODUÇÃO (banco `CorporeRM`) o `simular-login` exige a flag
  `--confirmo-producao`, senão aborta (trava contra troca acidental de senha de
  usuário real). Homologação (`HomologacaoWEB`) não pede a flag. O `restaurar`
  nunca é travado.

  ```bash
  node --env-file=.env.local scripts/simular-login.mjs 04812275636 asc321 --confirmo-producao
  ```
- O hash original fica guardado em `plataforma/scripts/.senha-backups/<cpf>.json`
  (uma entrada por conta/`CODUSUARIOPS`). Essa pasta é gitignorada — nunca
  versionar (contém hashes).
- A troca afeta TODAS as contas `SPSUSUARIO` do CPF; a restauração devolve cada
  uma exatamente como estava (inclusive contas sem senha).
- `simular-login` ABORTA se já houver backup para o CPF, para não sobrescrever o
  hash original com o temporário — sempre restaure antes de repetir.
- Cuidado ao usar com um usuário REAL em produção: durante a janela ele não
  consegue logar e a conta fica com senha fraca/conhecida. Prefira CPF de teste
  ou homologação.



Arquivo com comentário: 222.519.397-50 // 029.557.159-48





Status 10 = ClassificadoChamada ("Classificado em chamada"). 
Tanto o nosso portal quanto o portal nativo da TOTVS só liberam matrícula quando o status é 5 = EmChamada ou 7 = CompareceuChamada 

Confirmei no código da TOTVS onde função candidatoValidoParaMatricula() do controller nativo, que verifica exatamente DISPONIBILIZAMATRICULAPORTAL === 'T' && (STATUS === EmChamada || STATUS === CompareceuChamada).