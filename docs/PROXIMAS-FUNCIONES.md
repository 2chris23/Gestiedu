# Próximas funciones

Lo que viene después de terminar la auditoría. Aquí queda el diseño y, sobre todo,
las partes difíciles, para no descubrirlas a mitad del trabajo.

---

## 1. Asistencia de tres formas

> **Hecho el 2026-09-24**, tal como está escrito aquí (auditoría §58). Lo que
> quedó decidido en «Lo que hay que decidir»: radio de 150 m y «por confirmar»
> fuera de él, 2 minutos para llegar a tiempo contados desde el primer pase de
> esa clase ese día, 7 días para corregir hacia atrás — todo configurable en
> Configuración → Asistencia por QR. El pase no se cierra solo a los 2 minutos:
> pasado ese tiempo quien escanea entra como tarde, y el profesor lo cierra
> cuando quiere (y a las 3 horas deja de valer, por si se olvida).

Cuando el profesor (o el admin) entra a su clase, tiene tres maneras de pasar lista:

1. **A mano**: toca a cada alumno. Es la de siempre y **nunca se quita**: si se cae
   internet o una cámara no funciona, la clase tiene que poder seguir.
2. **El profesor muestra el QR**: deja el teléfono sobre la mesa y cada alumno, desde
   su propia app y dentro de esa clase, le da a "escanear asistencia".
3. **Al revés**: el profesor escanea el QR de cada alumno.

### El problema de verdad: que nadie firme por otro

Esto es lo único que hace difícil la función. Las formas de hacer trampa, y qué las
corta:

| Trampa | Qué la corta |
|---|---|
| **Le mando la foto del QR por WhatsApp a un amigo que está en su casa** | El QR **cambia cada 10 segundos**. Una foto sirve durante 10 segundos y ya no. Esta es la medida que más pesa de todas. |
| **Escaneo con mi teléfono y luego entro con la cuenta de mi amigo y escaneo otra vez** | Un mismo teléfono solo puede registrar **a un alumno por clase**. El segundo intento se rechaza y queda anotado como intento. |
| **Marco asistencia sin escanear nada, llamando al servidor directamente** | El registro solo se acepta con un código vivo de esa clase, del alumno dueño de la sesión y que esté inscrito en esa sección. |
| **Le enseño al profesor una captura del QR de otro alumno** (forma 3) | El QR del alumno también cambia cada pocos segundos, y al escanear **el profesor ve la foto y el nombre** de quien acaba de registrar. |

Y por encima de todo eso, la medida que más vale y no es técnica: **el profesor ve la
lista llenándose en vivo y puede quitar a cualquiera**. Está en el salón; sus ojos
valen más que cualquier código. La trampa que se cuela tiene que poder deshacerse en
un toque.

### El blindaje por ubicación (decidido: va)

El alumno solo puede escanear si está **dentro de un radio** del sitio de la clase.

El centro del radio **es el teléfono del profesor** en el momento de abrir el pase de
lista, no un punto fijo del liceo. Así funciona igual en el aula, en el patio, en el
anexo o en una salida, sin configurar coordenadas de nada.

El radio y si bloquea o solo avisa son **configuración de cada instituto**, no un
número escrito en el código. Punto de partida propuesto: 150 metros.

Para que sea escudo y no muro, cuando el GPS no da (permiso negado, señal mala dentro
del edificio, precisión peor que el radio) **no se rechaza en silencio**: la asistencia
entra marcada como *por confirmar* y aparece resaltada en la lista en vivo del
profesor, que la aprueba de un toque. El que sí está en clase nunca se queda fuera; el
que no está, tiene que pasar por delante del profesor.

Un detalle que decide dónde sirve esto de verdad: **la ubicación del navegador se
falsea en dos clics** desde el modo desarrollador. En la app instalada es bastante más
difícil y además Android avisa cuando la ubicación viene de un simulador, así que se
puede rechazar. O sea: el blindaje por GPS **muerde en la app**; en el navegador vale
poco y hay que tratarlo como tal.

### Cerrar sesión y entrar con la cuenta del amigo

El truco: escaneo con mi teléfono, cierro sesión, entro con la cuenta de mi amigo y
escaneo otra vez. Se corta así:

- El teléfono tiene un **identificador propio que sobrevive al cierre de sesión** (no
  se guarda con la sesión, se guarda con el aparato).
- Dentro de una misma clase, **un aparato registra a un alumno y a uno solo**. El
  segundo intento se rechaza y **le sale al profesor en la lista en vivo**: no es un
  error mudo, es un aviso de que alguien lo intentó.

**Una cuenta, un teléfono registrado.** El primer aparato desde el que un alumno pasa
asistencia queda asociado a él. Esto cierra también el caso de prestarle el teléfono a
un compañero, que era el agujero que quedaba abierto.

Y el desbloqueo vive **donde tiene que vivir: en el perfil del alumno**. Si vendió el
teléfono, se le dañó o lo cambió, el admin entra a su ficha y lo desbloquea de un
toque; el siguiente aparato desde el que escanee queda registrado.

Detalles que importan:

- **Solo el admin desbloquea.** El profesor no toca datos del alumno — es la misma
  regla de siempre.
- En la ficha se ve **qué aparato tiene registrado y desde cuándo**, para que el admin
  sepa qué está desbloqueando.
- Cada desbloqueo queda anotado: quién, cuándo y a qué alumno. Si un liceo tiene un
  admin desbloqueando a los mismos tres alumnos todas las semanas, eso se ve.

Con el desbloqueo así de fácil, el costo que preocupaba deja de ser un problema, así
que esta regla va **encendida por defecto**. Sigue siendo configuración del instituto:
si a algún liceo le resulta pesado, la apaga.

### La pantalla del profesor mientras el QR está abierto

Debajo del QR van apareciendo los avisos según entra cada uno: **"Sofía Andrade,
asistente"**, con su foto y la hora. El profesor está mirando eso mientras los alumnos
escanean, así que si entra alguien que no está en el salón lo ve en el momento.

Y lo desmarca **desde el propio aviso**, sin salir de la pantalla del QR: un toque
sobre el nombre y fuera. Está dando clase; obligarlo a navegar a otra pantalla para
corregir es garantizar que no lo corrija.

Arriba, la cuenta: **"18 de 32"**. Y al cerrar el pase de lista, antes de guardar, se
le enseña **quién no escaneó** — que es lo que va a quedar como falta. Nadie queda
ausente sin que el profesor lo haya visto en una lista.

### Corregir la asistencia de un día pasado con el mismo QR

Idea del usuario, y es buena: si el profesor olvidó marcar a alguien el martes, entra
a ese día, abre el QR, el alumno escanea y queda asistente de ese día.

Funciona porque aquí el QR no está probando que el alumno estuvo el martes — eso ya
pasó y lo decide el profesor. Lo que hace es **identificar al alumno sin teclear**, y
de paso la corrección queda firmada por los dos: el profesor la abrió, el alumno se
identificó.

Tres reglas para que esto no se convierta en un agujero:

- La corrección **se anota como corrección**: quién la hizo, cuándo, y que fue sobre un
  día anterior. En el registro de un alumno no puede haber cambios sin rastro.
- **El faro va en los dos modos, también aquí.** No prueba que el alumno estuvo el
  martes — eso lo decide el profesor. Prueba que está parado delante de él AHORA, que
  es lo que hace fiable la corrección. Sin eso, alguien recibe el QR por WhatsApp desde
  su casa y se arregla un día que faltó. Si el GPS falla, entra por confirmar y el
  profesor aprueba, que aquí es trivial porque tiene al alumno enfrente.
- **Hasta dónde se puede ir hacia atrás es configuración del instituto**, y el tope
  duro es el cierre del lapso: una vez cerrado, los porcentajes de asistencia ya
  entraron en los cálculos y en los boletines. Cambiar eso después no es una
  corrección, es reescribir un número que alguien ya leyó. Si hay que hacerlo, que sea
  una operación aparte, del admin, y bien visible.

### El límite honesto

Si un alumno le entrega su teléfono desbloqueado a un compañero para que se lo lleve a
clase, ninguna medida técnica lo distingue de un alumno con dos teléfonos. Para eso
está la lista en vivo: el profesor está en el salón, ve quién hay y quita a quien no.
Todo lo demás sube el costo de hacer trampa; esto último es lo que la cierra.

### Lo que hay que decidir antes de escribir código

- Radio por defecto y si bloquea o solo avisa (configuración por instituto).
- **Cuánto dura abierto el pase de lista**: propuesta, el profesor lo abre y se cierra
  solo a los 2 minutos (o cuando él quiera). Quien escanea después, entra como tarde.

### Lo que toca en la base de datos

- Hay que guardar **cómo se marcó cada asistencia** (a mano, QR del profesor, QR del
  alumno), **con qué teléfono** y a qué hora exacta. Si mañana hay un reclamo, hay con
  qué responder.
- **Ojo con esto**: hoy la asistencia es *una fila por alumno y día*
  (`@@unique([studentId, date])`) con un campo `periods` que marca qué horas asistió.
  Es decir: pasar lista en la segunda hora **no puede pisar** lo de la primera, tiene
  que encender su bit. Si esto se hace mal, el sistema "pierde" asistencia y es
  justo lo que no puede pasar.

### Lo que ya está a favor

El sistema ya tiene Socket.io funcionando, así que el código que rota cada 10 segundos
y la lista que se llena en vivo delante del profesor salen de algo que ya existe.

---

## 2. Importar el plan de evaluación desde Word

Un botón que reciba el `.docx` que el profesor ya tiene hecho y saque de ahí el plan,
sin importar cómo esté diseñada la tabla.

### Lo fácil y lo difícil

Leer el archivo es fácil: un `.docx` por dentro es XML y las tablas se leen sin drama.
Lo difícil es **entenderlas**: qué columna es la actividad, cuál el porcentaje, cuál la
fecha, cuál el tema generador. Cada profesor la arma distinta, con celdas combinadas,
encabezados en dos filas, varias tablas en el mismo archivo, o el plan escrito en
párrafos sin tabla ninguna.

### La decisión importante

**Nunca escribir directo en el plan.** El flujo tiene que ser: importar → **enseñar en
pantalla lo que se entendió** → el profesor corrige lo que haga falta → guardar.

No es por comodidad: los porcentajes del plan entran en el promedio de todos los
alumnos de la sección. Un peso mal leído cambia notas en silencio, que es exactamente
la clase de daño que este sistema no se puede permitir. Si los porcentajes no suman
100, la pantalla lo dice antes de guardar.

### Cómo reconocer la tabla

Por palabras del encabezado (actividad, instrumento, ponderación, peso, %, fecha,
semana, lapso, competencia, indicador, tema generador), normalizando mayúsculas,
acentos y las variantes que use cada quien. Y si no se reconoce nada, se enseña la
tabla tal cual para que el profesor diga qué es cada columna — eso también se puede
recordar para la próxima vez.

Vale la pena aceptar además **pegar la tabla** copiada de Word o Excel: muchas veces es
más cómodo que subir el archivo, y se lee igual.

### Pendiente de decidir

Si además se usa un modelo de inteligencia artificial para los archivos raros. Se
podría, pero saca datos del liceo hacia afuera, cuesta por uso y añade una pieza que
puede fallar. Recomendación: primero las reglas y la pantalla de confirmación, que
cubren la mayoría; la IA solo si de verdad queda un porcentaje molesto sin resolver.

Solo `.docx`. Los `.doc` viejos son otro formato distinto.

---

## 3. El logo del liceo como ícono de la app

Si el liceo cambia su logo, su app tiene que cambiar de ícono.

### En la web instalable: sí, y sale casi gratis

El manifiesto se genera por liceo (cada uno entra por su propio subdominio), con su
nombre y su logo. Del logo que suban se generan los tamaños que hacen falta (192, 512
y la versión recortable).

**El matiz honesto**: un ícono ya instalado en la pantalla de inicio no siempre se
actualiza solo. Android suele refrescarlo; **iPhone no** — quien ya la tenga instalada
tiene que borrarla y volver a agregarla. Eso hay que decírselo al liceo cuando cambien
el logo, no dejar que lo descubran.

### En el APK

El ícono de una app Android va cocinado dentro del archivo, así que un ícono por
liceo significa **una app por liceo**. Decidido que sí: ver la sección 4.

### Lo que hay que pedirle al liceo al subir el logo

Cuadrado, de al menos 512 píxeles y con fondo transparente. Si no, el ícono sale
recortado o con bordes feos, y eso se ve todos los días en el teléfono.

---

## 4. Una app por liceo (marca blanca)

Decisión del usuario: cada liceo tiene **su propia app**, con su nombre, su logo y
sus colores. Dos razones, las dos buenas: se ve como algo hecho para ese liceo, y
el sistema de abajo queda en segundo plano.

### Cómo se hace sin tocar código

Al crear el liceo desde el panel de superadmin (o al cambiarle el logo), el panel
dispara una construcción automática: toma nombre, logo, colores y la dirección del
liceo, arma el APK, lo firma y lo deja listo para descargar desde la pantalla de
entrada de ese liceo. Tarda unos minutos y va por su cuenta: crear el liceo sigue
siendo cosa de tres minutos, la app aparece sola un rato después.

### Lo que hay que montar una vez

- **Identificador distinto por liceo** (`ve.<algo>.liceo-bolivar`). Es obligatorio
  para que dos apps convivan en el mismo teléfono: un profesor que trabaje en dos
  liceos, o un representante con hijos en dos, va a tener las dos instaladas.
- **Una sola llave de firma para todas**, guardada por duplicado y fuera del
  repositorio. Si esa llave se pierde, **ninguna** de las apps se puede volver a
  actualizar: hay que generar otras y que todo el mundo reinstale.
- **Aviso de versión nueva dentro de la app**: cuando el liceo cambie su logo, la
  app instalada tiene que decirle a la gente que hay una nueva para descargar. Sin
  eso, el cambio de logo no se entera nadie.

### Dos cosas dichas claras

- **Cambiar el logo obliga a reinstalar.** El contenido se actualiza solo (la app
  abre la web), pero el ícono y el nombre viven dentro del archivo instalado. Es el
  precio de tener una app por liceo, y conviene que el liceo lo sepa antes.
- **El anonimato es de cara al usuario, no a prueba de todo.** Quien abra el APK con
  herramientas puede ver a qué dirección apunta y con qué está hecho. Para un liceo
  y su gente, la app es del liceo y punto; contra alguien que se ponga a mirar por
  dentro, no hay marca blanca que aguante.

---

## 5. Descartado por ahora

**Bluetooth como faro.** El GPS bajo techo tiene entre 10 y 50 metros de precisión, así
que el aula de al lado y el pasillo pasan el filtro. Bluetooth cerraría también eso
(alcance de unos 10 metros, funciona bajo techo, no se falsea a distancia).

Decisión del usuario: **no hace falta**. Con el GPS —que cierra el ataque real, el de
"desde mi casa"— y con el profesor viendo uno por uno quién escanea, alcanza. Queda
aquí anotado por si alguna vez un liceo pide más.


---

# El alcance completo, dicho por el dueño

Esto cierra la lista. Palabras suyas: *"sinceramente ya con eso y lo que te dije
anteriormente, son todas las funcionalidades que tendrá el sistema"*.

## 1. Mudar un estudiante a otro liceo

Exportar un estudiante con todo lo suyo y pasarlo a **otro liceo que también use
este sistema**.

Lo difícil no es el archivo: es que cada liceo tiene su propia base de datos y su
propio ciclo, sus propias materias y su propio plan de evaluación. Hay que decidir
qué viaja (¿el historial completo? ¿solo el año en curso?) y qué se hace con lo
que en el liceo nuevo no existe. **Se habla antes de construir.**

## 2. Archivos adjuntos en las actividades, comprimidos

El profesor sube **cualquier archivo** al crear una actividad, y el sistema lo
comprime para que no pese tanto.

Ojo con dos cosas: dónde se guardan (hoy no hay almacenamiento de archivos
montado; los respaldos siguen en el disco del propio servidor) y que subir
archivos es una de las puertas que la auditoría de seguridad **todavía no ha
mirado**.

## 3. Ranking de estudiantes del ciclo en curso

- **Admin:** todos los estudiantes del ciclo.
- **Profesor:** SOLO los estudiantes a los que da clase.

La métrica tiene que ser "lógica" — hay que definirla y anotarla en
`MAPA_DE_CALCULOS.md` antes de programarla. Un ranking mal calculado es peor que
no tenerlo: la gente toma decisiones con él.

## 4. Tarjeta de observaciones en el panel

- **Admin:** las 5 más recientes del liceo.
- **Profesor:** solo de las clases que imparte o de las que es guía.
- **Los dos:** poder crear una observación **sin estar dentro de una clase**.

El motivo es de la vida real: *"puede ser que esté en los pasillos y ocurra algo"*.
Al crearla así se elige a quién señala — **estudiantes sueltos, una sección
entera, o un año completo**.

---

**Nada de esto se empieza** hasta cerrar los tres frentes (seguridad,
funcionalidad, rendimiento), que es lo acordado.
