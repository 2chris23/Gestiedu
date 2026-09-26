-- LOS DATOS DEL ALUMNO QUE PIDEN LOS DOCUMENTOS DEL MINISTERIO
-- El Resumen Final y la certificación de calificaciones llevan, de cada
-- alumno, su nacionalidad, lugar y entidad federal de nacimiento, y si se
-- identifica con cédula de identidad o con cédula escolar. `cedulaEscolar`
-- guarda la escolar cuando el alumno la cambia por la de identidad.
ALTER TABLE "users" ADD COLUMN "nacionalidad" TEXT;
ALTER TABLE "users" ADD COLUMN "lugarDeNacimiento" TEXT;
ALTER TABLE "users" ADD COLUMN "entidadDeNacimiento" TEXT;
ALTER TABLE "users" ADD COLUMN "tipoDeCedula" TEXT;
ALTER TABLE "users" ADD COLUMN "cedulaEscolar" TEXT;
