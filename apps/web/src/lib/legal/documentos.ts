import { comoEscribir, type Titular } from './titular';

/**
 * LOS TEXTOS LEGALES DE GESTIEDU (19-oct-2026)
 *
 * Cristian: «crea subpáginas para todo el tema legal, que esté completo, cada
 * una con su página», y en la app, aceptar los términos al entrar la primera
 * vez y tenerlos en Configuración.
 *
 * Marco (investigado el 19-oct-2026): Venezuela no tiene una ley general de
 * protección de datos personales. Rigen la Constitución (art. 28, habeas data;
 * art. 60, honor, vida privada e intimidad, y el límite al uso de la
 * informática), los principios que fijó la Sala Constitucional del TSJ en la
 * sentencia 1318 del 4-ago-2011 (consentimiento libre e informado, finalidad,
 * calidad, legalidad…), la LOPNNA (el honor, la imagen y la vida privada de
 * niños, niñas y adolescentes), la Ley Especial contra los Delitos
 * Informáticos (2001), la Ley sobre Mensajes de Datos y Firmas Electrónicas
 * (2001) y la Ley de Infogobierno (2013). Donde la ley calla, se sigue la
 * buena práctica internacional.
 *
 * NO SON CONSEJO LEGAL: antes de publicarlos para clientes, que los revise un
 * abogado venezolano. Al cambiar algo de fondo de lo que se ACEPTA, sube
 * `VERSION_LEGAL` (y la del servidor, `services/legal.service.ts`): todos
 * vuelven a aceptar la vez siguiente que entren.
 */

export const VERSION_LEGAL = '2026-10-19';
export const ACTUALIZADO = '19 de octubre de 2026';

export type Bloque = string | { lista: string[] };
export interface Seccion {
    titulo: string;
    bloques: Bloque[];
}
export interface DocumentoLegal {
    id: string;
    titulo: string;
    /** Una línea: para el índice y la cabecera. */
    resumen: string;
    /** A quién va dirigido, dicho llano. */
    paraQuien: string;
    /** Lo que se acepta al entrar la primera vez. */
    seAcepta?: boolean;
    secciones: Seccion[];
}

const lista = (...items: string[]): Bloque => ({ lista: items });

export function losDocumentos(t: Titular): DocumentoLegal[] {
    const quien = t.nombre;
    const escribir = comoEscribir(t);
    return [
        // ── 1 ────────────────────────────────────────────────────────────────
        {
            id: 'terminos',
            titulo: 'Términos y condiciones de uso',
            resumen: 'Las reglas para usar Gestiedu: qué es, quién puede usarlo y qué se compromete cada uno.',
            paraQuien: 'Toda persona que entra a Gestiedu: personal del liceo, estudiantes y representantes.',
            seAcepta: true,
            secciones: [
                {
                    titulo: '1. Qué es Gestiedu',
                    bloques: [
                        `Gestiedu es un sistema de gestión escolar en línea (web y aplicación para Android) que ${quien} ofrece a liceos y colegios privados. Cada liceo tiene su propio espacio, separado del de los demás, donde lleva sus secciones, horarios, asistencia, notas, planes de evaluación, documentos, finanzas y comunicación con los representantes.`,
                        'Estos términos se aplican a cada persona que entra a Gestiedu con una cuenta que le dio su liceo. La relación entre el liceo y Gestiedu se rige además por las Condiciones del servicio para liceos.',
                    ],
                },
                {
                    titulo: '2. Quién da las cuentas',
                    bloques: [
                        'Gestiedu no tiene registro abierto. Las cuentas las crea el administrador de cada liceo, que decide quién entra y con qué rol (administrador, profesor, estudiante o representante). Si tu cuenta tiene un error o ya no debe existir, pídeselo a tu liceo.',
                        'Si eres menor de edad, usas Gestiedu porque tu liceo te dio una cuenta como parte de tu inscripción, con el conocimiento de tu representante.',
                    ],
                },
                {
                    titulo: '3. Tu cuenta y tu contraseña',
                    bloques: [
                        lista(
                            'Tu cuenta es personal: no la prestes ni uses la de otra persona.',
                            'Guarda tu contraseña. Si crees que alguien la conoce, cámbiala o pide a tu liceo que la cambie, y cierra tus sesiones abiertas desde Configuración.',
                            'La huella o el bloqueo del teléfono solo abren la app en ese teléfono: la primera vez siempre se entra con correo y contraseña.',
                            'Eres responsable de lo que se haga con tu cuenta mientras no avises de que la perdiste.'
                        ),
                    ],
                },
                {
                    titulo: '4. Lo que puede hacer cada rol',
                    bloques: [
                        lista(
                            'Estudiante: ve lo suyo (sus clases, actividades, notas, asistencia y horario). No edita ni sube información.',
                            'Representante: ve lo de los estudiantes que representa y, si el liceo lo activa, reporta pagos.',
                            'Profesor: registra asistencia, notas y planes de las clases que imparte y ve lo de sus secciones guía. No edita datos personales.',
                            'Administrador: gestiona el liceo dentro de Gestiedu y responde por el uso que hace de los datos de su comunidad.'
                        ),
                        'Gestiedu comprueba estos permisos en el servidor: intentar ver o cambiar lo que no te corresponde está prohibido, aunque la pantalla lo permitiera por un error.',
                    ],
                },
                {
                    titulo: '5. Normas de uso',
                    bloques: ['Al usar Gestiedu aceptas las Normas de uso aceptable. En resumen: usarlo solo para la vida escolar, con respeto, sin intentar entrar donde no te corresponde y sin publicar datos de otras personas.'],
                },
                {
                    titulo: '6. La información que se registra',
                    bloques: [
                        'La información de cada liceo (notas, asistencia, observaciones, pagos…) es del liceo y de las personas a las que se refiere, no de Gestiedu. Gestiedu la guarda y la procesa solo para prestar el servicio, como se explica en la Política de privacidad.',
                        'Las notas, la asistencia y las demás decisiones académicas las toma el liceo y su personal. Gestiedu hace los cálculos que el liceo configura (escalas, promedios, redondeos), pero no sustituye el criterio del liceo ni los documentos oficiales que este firme.',
                    ],
                },
                {
                    titulo: '7. Sin conexión',
                    bloques: [
                        'La app guarda en tu teléfono lo tuyo para que puedas trabajar sin internet. Lo que hagas sin conexión queda pendiente y se envía solo al volver la conexión; si otra persona cambió lo mismo mientras tanto, se te pregunta antes de pisarlo. Hasta que se envía, lo pendiente vive solo en tu teléfono.',
                    ],
                },
                {
                    titulo: '8. Disponibilidad',
                    bloques: [
                        `${quien} procura que Gestiedu funcione siempre, con respaldos diarios y vigilancia del servicio, pero puede haber interrupciones por mantenimiento, fallos de terceros (energía, internet, proveedores) o causas ajenas. En lo posible, el mantenimiento se avisa con antelación y se hace fuera del horario escolar.`,
                    ],
                },
                {
                    titulo: '9. Propiedad intelectual',
                    bloques: [
                        `El software, el diseño, la marca y los textos de Gestiedu son de ${quien}. El liceo y sus usuarios reciben un permiso de uso, no exclusivo e intransferible, mientras dure el servicio. No se permite copiar, descompilar o revender Gestiedu, ni usarlo para crear un producto que compita con él.`,
                        'Los logos, documentos y contenidos que sube cada liceo siguen siendo suyos.',
                    ],
                },
                {
                    titulo: '10. Suspensión de una cuenta',
                    bloques: ['El liceo puede desactivar una cuenta en cualquier momento. Gestiedu puede suspenderla si se usa para dañar el servicio, a otras personas o para cometer un delito, avisando al liceo.'],
                },
                {
                    titulo: '11. Responsabilidad',
                    bloques: [
                        `${quien} responde por prestar el servicio con diligencia y por proteger los datos como se describe en estos documentos. No responde por el uso que cada persona o liceo haga de la información, por decisiones académicas o administrativas del liceo, ni por daños causados por el mal uso de una cuenta, por la pérdida de un teléfono o por interrupciones ajenas a su control.`,
                    ],
                },
                {
                    titulo: '12. Cambios en estos términos',
                    bloques: [
                        'Si cambian de forma importante, Gestiedu lo avisará dentro de la app y te pedirá aceptarlos otra vez la siguiente vez que entres. La fecha de la versión vigente está arriba de este documento.',
                    ],
                },
                {
                    titulo: '13. Ley aplicable',
                    bloques: [
                        'Estos términos se rigen por las leyes de la República Bolivariana de Venezuela. Antes de acudir a un tribunal, las partes intentarán resolver cualquier diferencia de buena fe.',
                        `Para cualquier duda sobre estos términos, escribe ${escribir}.`,
                    ],
                },
            ],
        },

        // ── 2 ────────────────────────────────────────────────────────────────
        {
            id: 'privacidad',
            titulo: 'Política de privacidad',
            resumen: 'Qué datos se guardan, para qué, quién los ve, cuánto tiempo y qué derechos tienes.',
            paraQuien: 'Toda persona cuyos datos están en Gestiedu, y los liceos que lo usan.',
            seAcepta: true,
            secciones: [
                {
                    titulo: '1. Quién es responsable de tus datos',
                    bloques: [
                        'El responsable de los datos de cada comunidad escolar es su liceo: es quien decide qué se registra y para qué (la inscripción, las notas, la asistencia, los pagos). Gestiedu trata esos datos por encargo del liceo, siguiendo sus instrucciones y el Acuerdo de tratamiento de datos.',
                        `Los datos de quien visita la página principal o escribe para pedir una demostración los trata directamente ${quien}${t.rif ? ` (RIF ${t.rif})` : ''}${t.direccion ? `, con domicilio en ${t.direccion}` : ''}.`,
                    ],
                },
                {
                    titulo: '2. Qué datos se guardan',
                    bloques: [
                        lista(
                            'De identificación: nombres y apellidos, cédula (o cédula escolar), sexo, fecha y lugar de nacimiento, nacionalidad, y la foto de perfil si el liceo o la persona la sube.',
                            'De contacto: correo, teléfono y dirección.',
                            'Escolares: sección, año, horario, asistencia, notas, planes e instrumentos de evaluación, observaciones de conducta, citaciones, labor social, materias pendientes, documentos y constancias.',
                            'De la familia: quién representa a cada estudiante y su parentesco.',
                            'Económicos (si el liceo usa Finanzas): mensualidades, pagos, comprobantes y, para el personal, sus pagos.',
                            'De uso y seguridad: cuándo se entra, desde qué tipo de aparato, la dirección de red, los cambios hechos en el sistema (quién y cuándo), y los fallos de la app, sin datos personales.',
                            'De asistencia por QR (si el liceo la usa): el teléfono con el que se registró y, solo si la persona lo permite, una ubicación aproximada para comprobar que estaba en el aula. No se sigue a nadie fuera de ese momento.'
                        ),
                        'Gestiedu no pide ni guarda datos de salud, religión, opinión política ni datos bancarios completos.',
                    ],
                },
                {
                    titulo: '3. Para qué se usan',
                    bloques: [
                        lista(
                            'Para que el liceo lleve su gestión académica y administrativa.',
                            'Para que cada persona vea lo suyo: el estudiante sus notas, el representante a sus representados, el profesor sus clases.',
                            'Para enviar avisos dentro de la app y al teléfono (una nota nueva, una citación, un recordatorio de pago).',
                            'Para la seguridad: impedir accesos indebidos, saber quién cambió qué y recuperar lo borrado por error.',
                            'Para que el servicio funcione bien: medir tiempos de respuesta y fallos, sin mirar el contenido de nadie.'
                        ),
                        'Gestiedu no vende datos, no los usa para publicidad, no hace perfiles comerciales y no entrena con ellos sistemas de inteligencia artificial.',
                    ],
                },
                {
                    titulo: '4. La base para tratarlos',
                    bloques: [
                        'El consentimiento informado que la familia da al liceo al inscribirse y el que cada persona da al aceptar esta política, la relación educativa entre el liceo y su comunidad, y las obligaciones legales del liceo (los registros y documentos que pide el Ministerio del Poder Popular para la Educación). Así lo piden el artículo 28 de la Constitución y los principios fijados por la Sala Constitucional del TSJ (sentencia 1318 de 2011).',
                    ],
                },
                {
                    titulo: '5. Quién puede verlos',
                    bloques: [
                        lista(
                            'Dentro del liceo: cada persona según su rol (ver los Términos). Un estudiante nunca ve los datos ni las notas de sus compañeros.',
                            'Gestiedu: solo el personal técnico, cuando hace falta para dar soporte, mantener el servicio o resolver un fallo, y con obligación de confidencialidad.',
                            'Proveedores técnicos que ayudan a prestar el servicio (alojamiento, respaldos, avisos al teléfono, correo): ver Proveedores.',
                            'Autoridades: solo cuando una ley o una orden judicial lo exija.'
                        ),
                        'Gestiedu no envía nada al Ministerio ni a terceros por su cuenta: los documentos oficiales los imprime y entrega el liceo.',
                    ],
                },
                {
                    titulo: '6. Cuánto tiempo se guardan',
                    bloques: ['Mientras el liceo use Gestiedu y lo necesite para su historia académica. Lo borrado sale de la base al vencer la papelera y de los respaldos al caducar estos. Los detalles están en Conservación y borrado.'],
                },
                {
                    titulo: '7. Seguridad',
                    bloques: ['Conexiones cifradas, contraseñas guardadas solo como resumen, permisos comprobados en el servidor, liceos separados entre sí, respaldos diarios y registro de cambios. Los detalles están en Seguridad de la información.'],
                },
                {
                    titulo: '8. Tus derechos',
                    bloques: ['Puedes saber qué datos tuyos hay, pedir que se corrijan, que se actualicen o, cuando proceda, que se borren, y oponerte a un uso que no corresponda. Cómo pedirlo está en Tus derechos sobre tus datos.'],
                },
                {
                    titulo: '9. Si el liceo conecta su Google Drive',
                    bloques: [
                        'Si el liceo activa la copia automática en su Google Drive, Gestiedu pedirá solo el permiso para crear y ver los archivos que la propia app crea (no puede leer el resto del Drive). Esos archivos van cifrados con una contraseña del liceo. El uso de la información recibida de las API de Google se ajustará a la Política de datos de usuario de los servicios de API de Google, incluidos los requisitos de uso limitado.',
                    ],
                },
                {
                    titulo: '10. Cambios y contacto',
                    bloques: [`Si esta política cambia de forma importante, se avisará en la app y se pedirá aceptarla otra vez. Para cualquier pregunta sobre tus datos, escribe ${escribir}, o acude a la administración de tu liceo.`],
                },
            ],
        },

        // ── 3 ────────────────────────────────────────────────────────────────
        {
            id: 'menores',
            titulo: 'Datos de niños, niñas y adolescentes',
            resumen: 'Cómo se cuidan los datos de los estudiantes menores de edad.',
            paraQuien: 'Estudiantes, sus representantes y los liceos.',
            secciones: [
                {
                    titulo: 'Para el estudiante, en pocas palabras',
                    bloques: [
                        lista(
                            'Tu liceo usa Gestiedu para llevar tus notas, tu asistencia y tu horario.',
                            'Solo tú, tu representante y el personal de tu liceo que trabaja contigo ven lo tuyo. Tus compañeros no.',
                            'Nadie usa tus datos para publicidad ni los vende.',
                            'Si algo de lo tuyo está mal, díselo a tu representante o a tu liceo para que lo corrijan.'
                        ),
                    ],
                },
                {
                    titulo: 'El principio que manda',
                    bloques: [
                        'El interés superior del niño, niña y adolescente y su derecho al honor, la reputación, la propia imagen, la vida privada y la intimidad familiar, que protege la Ley Orgánica para la Protección de Niños, Niñas y Adolescentes (LOPNNA). Gestiedu se diseñó para tratar los datos de los estudiantes con el máximo cuidado.',
                    ],
                },
                {
                    titulo: 'Quién da el consentimiento',
                    bloques: [
                        'El de un estudiante menor de edad lo da su representante al inscribirlo en el liceo, y el liceo es quien le crea la cuenta en Gestiedu. El estudiante acepta además, a su nivel, las normas de uso de la app. El liceo debe informar a las familias de que usa Gestiedu.',
                    ],
                },
                {
                    titulo: 'Cómo se protegen sus datos',
                    bloques: [
                        lista(
                            'Lo mínimo necesario: solo los datos que el liceo necesita y que pide el Ministerio.',
                            'Nadie de afuera los ve: un estudiante no ve a sus compañeros, y un representante solo a quienes representa. Se comprueba en el servidor y con un barrido automático en cada versión.',
                            'Las observaciones de conducta y las citaciones las ve solo quien debe (el personal correspondiente, el estudiante y su representante).',
                            'Las fotos se redibujan en el servidor, lo que quita datos ocultos como la ubicación en la que se tomaron.',
                            'En la pantalla bloqueada del teléfono, los avisos dicen qué pasó y cuándo, sin detalles.',
                            'Los registros técnicos no guardan cédulas ni correos.',
                            'Las copias que salen del servidor van cifradas.',
                            'Sin publicidad, sin perfiles comerciales y sin vender ni ceder datos.'
                        ),
                    ],
                },
                {
                    titulo: 'Si algo sale mal',
                    bloques: ['Si se detecta un acceso indebido a datos de estudiantes, Gestiedu avisará al liceo sin demora para que informe a las familias, como se explica en Seguridad de la información.'],
                },
            ],
        },

        // ── 4 ────────────────────────────────────────────────────────────────
        {
            id: 'liceos',
            titulo: 'Condiciones del servicio para liceos',
            resumen: 'El acuerdo entre cada liceo y Gestiedu: el servicio, el pago, los datos y qué pasa al terminar.',
            paraQuien: 'Los liceos y colegios que contratan Gestiedu.',
            secciones: [
                {
                    titulo: '1. El servicio',
                    bloques: [`${quien} pone Gestiedu a disposición del liceo como servicio en línea, con su espacio separado, sus usuarios, sus configuraciones y sus datos, y con las actualizaciones que se vayan publicando. Las funciones y el plan contratado se acuerdan con cada liceo.`],
                },
                {
                    titulo: '2. Lo que hace el liceo',
                    bloques: [
                        lista(
                            'Designa a su administrador, crea y desactiva las cuentas y responde por quién tiene acceso.',
                            'Informa a su comunidad de que usa Gestiedu y obtiene el consentimiento de los representantes para tratar los datos de los estudiantes.',
                            'Registra información verídica y la usa solo para fines escolares.',
                            'Revisa los documentos oficiales antes de firmarlos y entregarlos.',
                            'Paga el plan acordado.'
                        ),
                    ],
                },
                {
                    titulo: '3. Precio y pago',
                    bloques: ['El precio, la moneda, la periodicidad y la forma de pago se acuerdan por escrito con cada liceo. Si el pago se atrasa más de lo acordado, Gestiedu avisará antes de limitar el servicio, y nunca borrará datos por falta de pago sin dar antes al liceo la oportunidad de bajarlos.'],
                },
                {
                    titulo: '4. Los datos son del liceo',
                    bloques: [
                        'La información que el liceo registra es suya. Gestiedu la trata por su encargo según el Acuerdo de tratamiento de datos, y no la usa para nada más.',
                        'El administrador puede bajar en cualquier momento todos los datos del liceo en un archivo que se abre sin Gestiedu (Configuración → Descargar todos los datos): Excel por ciclo, las fotos y las facturas, protegidos con una contraseña que elige el liceo.',
                    ],
                },
                {
                    titulo: '5. Disponibilidad y soporte',
                    bloques: ['Gestiedu se vigila de forma continua (tiempos de respuesta, errores y un recorrido automático cada pocos minutos), hace respaldos diarios y atiende las incidencias por el canal acordado. El mantenimiento previsto se avisa con antelación y se hace, en lo posible, fuera del horario escolar.'],
                },
                {
                    titulo: '6. Duración y fin del servicio',
                    bloques: [
                        'El servicio dura lo acordado y se renueva salvo aviso. Cualquiera de las partes puede terminarlo con el preaviso pactado.',
                        'Al terminar, el liceo tiene 60 días para bajar todos sus datos. Pasado ese plazo, Gestiedu borra su espacio y, al caducar, sus respaldos. Si Gestiedu dejara de prestarse por completo, avisaría a los liceos con la antelación suficiente para que cada uno baje lo suyo.',
                    ],
                },
                {
                    titulo: '7. Responsabilidad',
                    bloques: [`La responsabilidad de ${quien} se limita a lo que el liceo haya pagado en los últimos doce meses, salvo dolo o culpa grave. ${quien} no responde por decisiones académicas o administrativas del liceo ni por el uso que este haga de los datos.`],
                },
                {
                    titulo: '8. Ley aplicable',
                    bloques: ['Estas condiciones se rigen por las leyes de la República Bolivariana de Venezuela. El contrato que firme cada liceo puede completarlas o precisarlas.'],
                },
            ],
        },

        // ── 5 ────────────────────────────────────────────────────────────────
        {
            id: 'tratamiento-de-datos',
            titulo: 'Acuerdo de tratamiento de datos',
            resumen: 'Las reglas con las que Gestiedu trata los datos por encargo de cada liceo.',
            paraQuien: 'Los liceos (responsables de los datos) y Gestiedu (encargado).',
            secciones: [
                {
                    titulo: '1. Los papeles de cada uno',
                    bloques: [`El liceo es el responsable de los datos de su comunidad. ${quien} es el encargado: los trata solo para prestar Gestiedu y siguiendo las instrucciones del liceo, que son las que este da al configurar y usar el sistema.`],
                },
                {
                    titulo: '2. Lo que Gestiedu se compromete a hacer',
                    bloques: [
                        lista(
                            'Tratar los datos solo para prestar el servicio, nunca para fines propios.',
                            'Mantenerlos separados de los de otros liceos.',
                            'Guardar confidencialidad, y exigirla a su personal y a sus proveedores.',
                            'Aplicar las medidas de Seguridad de la información.',
                            'Usar solo los proveedores de la lista de Proveedores, y avisar al liceo antes de añadir uno nuevo que trate sus datos.',
                            'Ayudar al liceo a atender los derechos de las personas (acceso, corrección, borrado).',
                            'Avisar al liceo sin demora, y en todo caso en un máximo de 72 horas desde que lo sepa, de cualquier incidente que afecte a sus datos.',
                            'Al terminar el servicio, devolver los datos (la descarga completa) y después borrarlos, salvo lo que la ley obligue a guardar.',
                            'Dar al liceo la información razonable que pida para comprobar que se cumple este acuerdo.'
                        ),
                    ],
                },
                {
                    titulo: '3. Lo que el liceo se compromete a hacer',
                    bloques: [lista('Tener la base legítima para tratar los datos (el consentimiento de las familias y su relación educativa).', 'Informar a su comunidad de que usa Gestiedu.', 'Dar acceso solo a quien corresponda y desactivar las cuentas que ya no deban existir.')],
                },
                {
                    titulo: '4. Dónde están los datos',
                    bloques: ['En los servidores contratados por Gestiedu y en las copias de respaldo cifradas descritas en Proveedores. Si algún proveedor guarda datos fuera de Venezuela, se elige con garantías de seguridad equivalentes.'],
                },
            ],
        },

        // ── 6 ────────────────────────────────────────────────────────────────
        {
            id: 'uso-aceptable',
            titulo: 'Normas de uso aceptable',
            resumen: 'Lo que no se puede hacer en Gestiedu.',
            paraQuien: 'Todas las personas que usan Gestiedu.',
            secciones: [
                {
                    titulo: 'No está permitido',
                    bloques: [
                        lista(
                            'Usar la cuenta de otra persona o prestar la tuya.',
                            'Intentar ver, cambiar o borrar lo que tu rol no permite, aunque encuentres la forma.',
                            'Registrar información falsa, ofensiva o que dañe el honor o la imagen de otra persona, y en especial de un estudiante.',
                            'Sacar, copiar o difundir datos de otras personas fuera de la vida escolar (por ejemplo, publicar notas, fotos o listas en redes sociales).',
                            'Firmar la asistencia por otro estudiante o engañar al sistema de asistencia por QR.',
                            'Atacar el servicio: sobrecargarlo, buscar fallos de seguridad sin permiso, meter programas dañinos o automatizar accesos.',
                            'Usar Gestiedu para fines ajenos a la escuela, para publicidad o para cometer un delito.'
                        ),
                    ],
                },
                {
                    titulo: 'Si encuentras un fallo de seguridad',
                    bloques: ['Repórtalo sin aprovecharlo, desde Configuración → Reportar un problema o por el contacto de Gestiedu. Agradecemos el aviso responsable.'],
                },
                {
                    titulo: 'Qué pasa si se incumplen',
                    bloques: ['El liceo puede desactivar la cuenta, y Gestiedu puede suspenderla avisando al liceo. Los actos que sean delito (como el acceso indebido o el sabotaje, que castiga la Ley Especial contra los Delitos Informáticos) pueden denunciarse a las autoridades.'],
                },
            ],
        },

        // ── 7 ────────────────────────────────────────────────────────────────
        {
            id: 'cookies',
            titulo: 'Cookies y datos en tu aparato',
            resumen: 'Qué guarda Gestiedu en tu navegador o teléfono, y por qué.',
            paraQuien: 'Quien usa la web o la app de Gestiedu.',
            secciones: [
                {
                    titulo: 'Solo lo necesario',
                    bloques: ['Gestiedu no usa cookies de publicidad, de seguimiento ni de analítica de terceros. Todo lo que guarda en tu aparato sirve para que el sistema funcione.'],
                },
                {
                    titulo: 'Qué guarda',
                    bloques: [
                        lista(
                            'Cookies de sesión: mantienen tu sesión abierta de forma segura (la llave no la puede leer ningún programa de la página) y recuerdan de qué liceo eres.',
                            'Preferencias: el color de la app, el modo claro u oscuro y si la barra lateral está recogida.',
                            'Lo tuyo para trabajar sin conexión: una copia de lo que te corresponde ver, y lo que hiciste sin conexión hasta que se envía. Es solo de tu cuenta: otra persona que entre en el mismo aparato no lo ve, se borra al cerrar sesión y caduca a los siete días.',
                            'La cáscara de la app: las pantallas y los estilos, para que abra rápido y también sin internet. No contiene datos de nadie.'
                        ),
                    ],
                },
                {
                    titulo: 'Cómo borrarlo',
                    bloques: ['Al cerrar sesión se borra lo tuyo. También puedes borrar los datos del sitio desde la configuración de tu navegador o, en la app, desde los ajustes de Android. Si lo borras, tendrás que volver a entrar y la app volverá a bajar lo tuyo.'],
                },
            ],
        },

        // ── 8 ────────────────────────────────────────────────────────────────
        {
            id: 'seguridad',
            titulo: 'Seguridad de la información',
            resumen: 'Cómo se protegen los datos y qué se hace si algo falla.',
            paraQuien: 'Liceos, familias y cualquiera que quiera saberlo.',
            secciones: [
                {
                    titulo: 'Las medidas',
                    bloques: [
                        lista(
                            'Todo viaja cifrado (HTTPS). Las pantallas no se dejan meter en otras páginas.',
                            'Las contraseñas se guardan solo como resumen: nadie, ni Gestiedu, puede leerlas. Tras varios intentos fallidos, la cuenta se frena un rato.',
                            'La sesión rota su llave en cada uso y se anula al cerrar sesión.',
                            'Cada liceo vive separado de los demás, y cada petición se comprueba contra el liceo de quien la hace.',
                            'Los permisos se comprueban en el servidor, en cada pantalla y en cada acción; un barrido automático revisa que ningún estudiante ni representante reciba datos de otro.',
                            'Respaldos cada noche, probados recuperándolos; la copia que sale del servidor va cifrada.',
                            'Se registra quién cambió qué y cuándo. Lo borrado va a una papelera de la que el administrador puede recuperarlo.',
                            'El servicio se vigila de forma continua: tiempos de respuesta, errores y un recorrido automático cada pocos minutos.'
                        ),
                    ],
                },
                {
                    titulo: 'Si hay un incidente',
                    bloques: ['Si se detecta un acceso indebido o una pérdida de datos, Gestiedu lo contiene, lo investiga y avisa al liceo afectado sin demora (en un máximo de 72 horas desde que lo sepa), con lo que pasó, qué datos se vieron afectados y qué se hizo. El liceo informa a su comunidad.'],
                },
                {
                    titulo: 'Lo que puedes hacer tú',
                    bloques: [lista('Usa una contraseña que no uses en otro sitio.', 'Activa el bloqueo de tu teléfono.', 'Cierra sesión en aparatos que no son tuyos.', 'Si ves algo raro, repórtalo desde Configuración → Reportar un problema.')],
                },
            ],
        },

        // ── 9 ────────────────────────────────────────────────────────────────
        {
            id: 'conservacion',
            titulo: 'Conservación y borrado de datos',
            resumen: 'Cuánto se guarda cada cosa, cómo se recupera lo borrado y cuándo desaparece para siempre.',
            paraQuien: 'Liceos y personas cuyos datos están en Gestiedu.',
            secciones: [
                {
                    titulo: 'Lo del liceo',
                    bloques: ['Se guarda mientras el liceo use Gestiedu: es su historia académica (boletas, resúmenes finales, certificaciones de varios años). Al terminar el servicio, el liceo tiene 60 días para bajarlo todo y después se borra.'],
                },
                {
                    titulo: 'Lo que borra el administrador',
                    bloques: [
                        lista(
                            'Va primero a la papelera, con todo lo que arrastra (un estudiante con sus notas y su asistencia).',
                            'Desde la papelera se puede restaurar entero durante el plazo que elige el liceo: de 7 a 90 días, 30 si no elige.',
                            'Pasado ese plazo, o si el administrador pulsa «Borrar para siempre», se borra de la base de datos.',
                            'Las copias de respaldo se guardan unos días (hoy, 14) y se renuevan solas: lo borrado desaparece de ellas al caducar la última que lo tenía.'
                        ),
                    ],
                },
                {
                    titulo: 'Otros plazos',
                    bloques: [
                        lista(
                            'Avisos leídos: 180 días.',
                            'Sesiones cerradas o caducadas: se borran solas.',
                            'Registros de cambios para la descarga sin conexión: 30 días.',
                            'Archivos de «Descargar todos los datos»: 24 horas en el servidor.',
                            'Lo guardado en tu teléfono: se borra al cerrar sesión y caduca a los siete días.'
                        ),
                    ],
                },
                {
                    titulo: 'Descargar todo',
                    bloques: ['El administrador del liceo puede bajar en cualquier momento todos los datos del liceo, en un archivo que se abre sin Gestiedu (Configuración → Descargar todos los datos). Es la garantía de que, pase lo que pase, el liceo no pierde su información.'],
                },
            ],
        },

        // ── 10 ───────────────────────────────────────────────────────────────
        {
            id: 'derechos',
            titulo: 'Tus derechos sobre tus datos',
            resumen: 'Cómo saber qué datos tuyos hay, corregirlos o pedir que se borren.',
            paraQuien: 'Toda persona cuyos datos están en Gestiedu.',
            secciones: [
                {
                    titulo: 'Tus derechos',
                    bloques: [
                        'La Constitución (artículo 28) te reconoce el derecho de acceder a la información que haya sobre ti y a conocer el uso y la finalidad que se le da, y a pedir que se actualice, se corrija o se destruya si es errónea o afecta ilegítimamente tus derechos (habeas data). En concreto, puedes pedir:',
                        lista('Acceso: saber qué datos tuyos hay y para qué se usan.', 'Corrección y actualización: que se arregle lo que está mal o incompleto.', 'Borrado: que se borre lo que ya no hace falta o se registró sin base, salvo lo que el liceo deba conservar por ley (como el historial académico).', 'Oposición: que no se use para algo que no corresponde.'),
                        'Si eres menor de edad, estos derechos los ejerce tu representante, contigo.',
                    ],
                },
                {
                    titulo: 'Cómo pedirlo',
                    bloques: [
                        `Primero, a la administración de tu liceo: es quien decide sobre tus datos y puede corregirlos al momento. Si no te responde o es algo de Gestiedu, escribe ${escribir}, diciendo quién eres, de qué liceo y qué pides. Respondemos en un máximo de 15 días hábiles.`,
                        'Para proteger tus datos, podemos pedirte que confirmes tu identidad antes de responder.',
                    ],
                },
            ],
        },

        // ── 11 ───────────────────────────────────────────────────────────────
        {
            id: 'proveedores',
            titulo: 'Proveedores que intervienen',
            resumen: 'Los servicios de terceros que ayudan a prestar Gestiedu, y qué reciben.',
            paraQuien: 'Liceos y cualquiera que quiera saberlo.',
            secciones: [
                {
                    titulo: 'Quiénes son y qué reciben',
                    bloques: [
                        lista(
                            'Alojamiento (servidor y base de datos): guarda los datos de los liceos. Lo contrata Gestiedu con garantías de seguridad.',
                            'Almacenamiento de respaldos (Cloudflare R2, si está activo): recibe las copias nocturnas, siempre cifradas con una llave que solo tiene Gestiedu.',
                            'Avisos al teléfono (Web Push del navegador y Firebase Cloud Messaging de Google, en la app): reciben un aviso con qué pasó y cuándo, sin detalles ni datos de estudiantes.',
                            'Correo (el proveedor de correo que se configure): recibe la dirección y el texto del aviso que se envía.',
                            'Tasa del día: Gestiedu consulta servicios públicos que publican la tasa del BCV. No reciben ningún dato de nadie.',
                            'Google Drive (solo si el liceo lo conecta): recibe la copia cifrada del liceo, en el Drive del propio liceo.'
                        ),
                        'Si se añade un proveedor que trate datos de los liceos, se actualiza esta lista y se avisa a los liceos antes.',
                    ],
                },
            ],
        },

        // ── 12 ───────────────────────────────────────────────────────────────
        {
            id: 'aviso-legal',
            titulo: 'Aviso legal',
            resumen: 'Quién está detrás de Gestiedu y las condiciones de esta página.',
            paraQuien: 'Quien visita la página de Gestiedu.',
            secciones: [
                {
                    titulo: 'El titular',
                    bloques: [
                        lista(
                            `Titular: ${quien}`,
                            ...(t.rif ? [`RIF: ${t.rif}`] : []),
                            ...(t.direccion ? [`Domicilio: ${t.direccion}`] : []),
                            ...(t.correo ? [`Correo: ${t.correo}`] : ['Contacto: por el botón de contacto de la página principal'])
                        ),
                    ],
                },
                {
                    titulo: 'Esta página',
                    bloques: [
                        'La información de esta página describe Gestiedu y puede cambiar. Las capturas son ejemplos con datos inventados. Los contenidos, el diseño y la marca son del titular; no se pueden copiar sin su permiso.',
                        'Los mensajes y documentos electrónicos que se intercambien con Gestiedu tienen el valor que les da la Ley sobre Mensajes de Datos y Firmas Electrónicas.',
                    ],
                },
                {
                    titulo: 'Ley aplicable',
                    bloques: ['Esta página y su uso se rigen por las leyes de la República Bolivariana de Venezuela.'],
                },
            ],
        },
    ];
}

export function unDocumento(t: Titular, id: string): DocumentoLegal | undefined {
    return losDocumentos(t).find((d) => d.id === id);
}
