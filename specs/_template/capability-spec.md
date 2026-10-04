---
schema_version: 1
capability_id: CAP-<COD>
status: draft
owner: <dueño de la capacidad>
provenance: <de dónde sale el contenido>
---

# Capacidad: <nombre>

<!-- Un contrato durable por capacidad. Las secciones van de lo estable a lo volátil.
     Escribir sólo lo que el código no dice. Sin rutas de archivo ni nombres de símbolo:
     eso vive en el issue y en `docs/`.
     `status`: `draft` mientras un AC no tiene test; `ratified` cuando todos lo tienen;
     `superseded` cuando otro spec lo reemplaza. -->

## Propósito

<!-- Una o dos oraciones: qué hace para el instrumento y lo único que tiene que hacer bien. -->

## Lenguaje de la capacidad

<!-- El término canónico, qué es acá, y los sinónimos que no se usan. -->

| Término | Significado acá | Evitar |
|---|---|---|
| | | |

## Comportamiento normativo

<!-- Un encabezado por regla, con ID estable. Un ID no se renumera ni se reutiliza.
     Retirar es borrar: la regla sale con su test, y el número queda como hueco.
     EARS: "El sistema DEBE", "CUANDO <disparador>, el sistema DEBE",
     "SI <condición>, ENTONCES el sistema DEBE", "MIENTRAS <estado>, el sistema DEBE".
     Un cálculo va con su fórmula y sus valores de referencia. -->

### BR-<COD>-001 — <nombre>

CUANDO <disparador>, el sistema DEBE <comportamiento observable>.

## Criterios de aceptación

<!-- Un encabezado por criterio, con ID estable. Binario, con los valores que deciden.
     Lo cierra un agente, no una persona mirando o escuchando. Nombra las reglas que verifica. -->

### AC-<COD>-001 — <nombre> *(verifica BR-<COD>-001)*

DADO <estado> CUANDO <acción> ENTONCES <resultado observable con valores>.

## No objetivos

- Esta capacidad NO <...>.

## Contratos

<!-- Qué recibe, qué contesta y qué pasa en el borde. El caso de falla va junto al de éxito. -->

- **Entrada:** <...>
- **Salida:** <...>
- **Falla:** <...>

## Señales

- <lo que emite al cumplirse y al rechazar>.

## Dependencias

- <capacidad> (<consume | alimenta>): <qué usa>.

## Preguntas abiertas

<!-- Huecos sin resolver. Nunca un valor inventado. -->

- **OQ-<COD>-001 — <pregunta>**
  - Por qué sigue abierta: <...>
  - Decide: <...>
  - Bloquea: <...>
