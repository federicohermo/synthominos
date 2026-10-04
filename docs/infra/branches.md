# Ramas

Este repositorio tiene **dos ramas compartidas con roles distintos**, y ramas de trabajo cuyo prefijo
dice qué clase de cambio son. Este archivo dice qué hace cada una, qué las protege, y qué hacer cuando
el hook te frena.

## Los dos roles

| Rama | Rol | Quién le escribe |
|---|---|---|
| `staging` | **Integración**, y la **default** del repositorio | cada PR de una rama de trabajo, y los commits `hotfix:` |
| `main` | **Release**: es la rama de producción del deploy | sólo un PR de promoción desde `staging` |

La rama de producción del proveedor de deploy se declara **explícitamente** en `main`, y no se hereda
de la default. La configuración del build vive en [`deploy.md`](./deploy.md), que es su archivo; acá
sólo importa qué rama publica.

Los PR se mergean con merge commit. Un squash deja en `main` un commit que no está en `staging`, y la
promoción siguiente vuelve a proponer todo como conflicto.

## Las ramas de trabajo

Una rama de trabajo sale de `staging` y vuelve a `staging` por PR. Su prefijo dice qué clase de cambio
es, y es lo único que el hook mira:

| Prefijo | Qué cambia | Toca `src/` |
|---|---|---|
| `feature/` | lo que el instrumento hace: crea o modifica una capacidad, y su spec es el primer commit | sí |
| `bugfix/` | un bug; lleva spec sólo si el bug era una regla sin escribir | sí |
| `refactor/` | la forma del código sin cambiar lo que hace | sí |
| `improvement/` | UI, arte, audio o rendimiento, sin cambiar una regla | sí |
| `harness/` | el harness: hooks, skills, reglas, CI | no |
| `docs/` | documentación | no |

**Un hotfix no es una rama**: es un commit directo en `staging` cuyo mensaje empieza con `hotfix:`.
El hook deja escribir el producto desde `staging` por eso.

## El ruleset

`main` está protegida por un ruleset —`main-solo-por-pr-verde`, **id 21477023**— con exactamente
estas reglas:

| Regla | Valor |
|---|---|
| `pull_request` | puesta: a `main` no se pushea directo |
| `required_status_checks` | `[verify]` |
| `bypass_actors` | `[]` — **nadie**, ni el dueño |

El id se escribe acá porque es lo que hace falta para desarmarlo
(`gh api -X DELETE repos/federicohermo/pentomino-games/rulesets/21477023`), y un gate que no se sabe
desarmar se desarma mal: a los manotazos, o borrando la rama.

`staging` **no tiene ruleset**: es adonde va un `hotfix:`, y el bypass que haría falta para un actor
que no sea el dueño no existe en un repositorio personal (la API responde `422` a un bypass por
integración, medido el 2026-08-26).

### Por qué la rama default es `staging` y no la productiva

La default de GitHub no significa producción: significa la base **preseleccionada** de cada PR nuevo,
lo que da un `clone` fresco, y cuál rama toma el proveedor de deploy como producción si nadie la fija.

El argumento es asimétrico, y por eso no hay empate:

- Con `main` de default, el error es **silencioso y grave**: una rama de trabajo aterriza directo en la
  rama de release. El ruleset no lo impide —sólo exige `verify` en verde, no una rama de origen— así
  que la integración se saltea sin que nada avise.
- Con `staging` de default, el error es **visible e inofensivo**: un PR de promoción que apunta a
  `staging` no rompe nada y se retargetea en dos clics.

## Las dos copias que la maquinaria tiene del modelo

El modelo está escrito en dos lugares del árbol además de acá, y ninguno puede leer al otro: uno es
YAML que GitHub Actions parsea antes de que exista un proceso donde correr código, y el otro es el
núcleo del hook que corre en cada edición. Lo que cada uno declara:

| Dónde | Qué declara | Ramas |
|---|---|---|
| `.github/workflows/verify.yml` | `on.push.branches` | `staging`, `main` |
| `.agents/scripts/policy.ts` | `INTEGRATION_BRANCH` y `RELEASE_BRANCH` | `staging`, `main` |

`verify` corre sobre las dos porque la rama que se publica no puede ser la única sin corrida propia, y
el hook nombra a las dos porque las dos reciben trabajo de otros: **es el mismo conjunto**, y no por
casualidad — una rama compartida sin corrida propia es exactamente el agujero que este modelo cierra.

Que las dos digan lo mismo que este documento lo verifica
[`__tests__/ramas-sincronizadas.test.ts`](../../__tests__/ramas-sincronizadas.test.ts): lee del disco,
compara texto, y corre sin red.

## Cuando el hook te frena

`.agents/scripts/hook.ts` corre antes de cada edición, en Claude Code y en Codex. Bloquea escribir
`src/` o `mcp-server/src/` desde una rama cuyo prefijo no sea uno de los cuatro del producto, y desde
`main`. El mensaje dice cuál es el problema; las salidas son dos:

```bash
git switch staging && git pull
git switch -c feature/<descripcion-kebab>   # o bugfix/, refactor/, improvement/
```

o, si es un arreglo de una línea que no merece rama, commitearlo en `staging` con `hotfix:`.

El mismo hook rechaza abrir un worktree de este repo fuera de `.claude/worktrees/`, que es la única
carpeta que barre `node .agents/scripts/clean-worktrees.ts`. Los worktrees que abre la app de Codex
viven en `~/.codex/worktrees/` y los limpia ella: el hook no los ve y el limpiador no los toca.

Si el hook no puede leer algo —git no contesta, el payload no se entiende— deja pasar y lo avisa. Lo
que protege es una convención, no un secreto.

## Qué no verifica nadie

**Que el ruleset siga puesto.** Vive en la configuración de GitHub, no en el repositorio, y leerlo
cuesta una llamada de red: los tests de este repo corren sin red a propósito. El gate cruza las copias
que están en el árbol y **declara** que ésta no la mira.

Si alguien borra el ruleset, nada del repositorio se pone en rojo. Comprobarlo es una llamada:

```bash
gh api repos/federicohermo/pentomino-games/rulesets/21477023
```

Si algún día se quiere cubrir de verdad, el lugar es un paso de la Action y no un test: ahí sí hay red
y hay token.
