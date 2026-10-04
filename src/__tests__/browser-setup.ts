import '../styles/index.css';

/**
 * Lo unico que el proyecto de navegador necesita antes de cada archivo: la hoja de
 * estilos.
 *
 * No es cosmetico y es la trampa mas cara de testear en un navegador de verdad. Sin
 * este import las clases de Tailwind estan en el `className` —o sea que un test que
 * lea el atributo pasa— pero no existen como reglas, asi que `getComputedStyle`
 * devuelve los valores iniciales: `z-10` se lee `auto`, un `h-24` se lee `auto` y
 * `getBoundingClientRect()` de un canvas estirado por CSS devuelve 0. Un test de
 * layout pasaria o fallaria por el motivo equivocado, sin decirlo.
 *
 * Va en el setup y no en cada test por eso mismo: si depende de que alguien se
 * acuerde, el dia que no se acuerde el test no falla — miente.
 */
