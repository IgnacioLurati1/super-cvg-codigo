// The practice database of the SQL lab, for Bases de Datos: the real estate agency of the 2025 exams in the notes of El
// Santo Resumen (parcial-2), with their tables and columns, so the exercises of the notes run here once written as
// SQLite says them. Types as the course writes them in MySQL, and foreign keys «on delete restrict on update cascade»
// as all of theirs. Made up to practice: the people, addresses and amounts are not anyone's. «Reiniciar la base»
// builds it again from here.

// [id, tipo_doc, nro_doc, nombre, apellido, domicilio, telefono, email, cuil, matricula]: the agents have a licence.
const PERSONAS = [
  [1, 'dni', '28111222', 'John', 'Sheridan', 'Córdoba 1200', '3415550101', 'jsheridan@ejemplo.com', '20281112229', 'A-101'],
  [2, 'dni', '30222333', 'Susan', 'Ivanova', 'Mendoza 850', '3415550102', 'sivanova@ejemplo.com', '27302223334', 'A-102'],
  [3, 'dni', '31333444', 'Michael', 'Garibaldi', 'Santa Fe 2310', '3415550103', 'mgaribaldi@ejemplo.com', '20313334449', 'A-103'],
  [4, 'dni', '35444555', 'Ana', 'Gómez', 'Pellegrini 640', '3415550104', 'ana.gomez@ejemplo.com', '27354445556', null],
  [5, 'dni', '36555666', 'Bruno', 'Pereyra', 'Rioja 1715', '3415550105', 'bruno.pereyra@ejemplo.com', '20365556663', null],
  [6, 'dni', '37666777', 'Carla', 'Sosa', 'Corrientes 980', '3415550106', 'carla.sosa@ejemplo.com', '27376667778', null],
  [7, 'dni', '33777888', 'Diego', 'Ríos', 'San Luis 2045', '3415550107', 'diego.rios@ejemplo.com', '20337778887', null],
  [8, 'dni', '29888999', 'Elena', 'Fernández', 'Entre Ríos 455', '3415550108', 'elena.fernandez@ejemplo.com', '27298889990', null],
  [9, 'dni', '27999000', 'Facundo', 'Acosta', 'Urquiza 1390', '3415550109', 'facundo.acosta@ejemplo.com', '20279990001', null],
  [10, 'dni', '32111000', 'Gisela', 'Benítez', 'Maipú 760', '3415550110', 'gisela.benitez@ejemplo.com', '27321110002', null],
];

// [id, direccion, zona, tipo, situacion]
const PROPIEDADES = [
  [12001, 'Córdoba 1450, 3° B', 'Centro', 'departamento', 'alquilada'],
  [12002, 'Mendoza 3200', 'Echesortu', 'casa', 'en oferta'],
  [12003, 'Eva Perón 7900', 'Fisherton', 'casa', 'en oferta'],
  [12004, 'Jujuy 1980, PB', 'Pichincha', 'local', 'alquilada'],
  [12005, 'Rondeau 410', 'Alberdi', 'departamento', 'en oferta'],
  [12006, 'Oroño 1250, 8° A', 'Centro', 'departamento', 'retirada'],
];

// [id_propiedad, fecha_hora_desde, valor]: the monthly value from each date on, as the course keeps prices.
const VALORES = [
  [12001, '2025-01-01 00:00:00', 380000], [12001, '2025-07-01 00:00:00', 450000], [12001, '2026-01-01 00:00:00', 520000],
  [12002, '2025-03-01 00:00:00', 600000], [12002, '2026-03-01 00:00:00', 720000],
  [12003, '2025-05-15 10:00:00', 900000], [12003, '2026-12-01 00:00:00', 1050000],
  [12004, '2024-11-01 00:00:00', 700000], [12004, '2025-11-01 00:00:00', 850000],
  [12005, '2025-08-01 00:00:00', 410000],
  [12006, '2025-02-01 00:00:00', 650000],
];

// [id, id_propiedad, id_cliente, id_agente, fecha_solicitud, importe_mensual, estado, nro_contrato]
const SOLICITUDES = [
  [1, 12001, 4, 1, '2025-02-10', 380000, 'en alquiler', 'C-0001'],
  [2, 12001, 5, 1, '2025-02-12', 360000, 'rechazada', null],
  [3, 12002, 6, 2, '2025-04-03', 590000, 'pendiente', null],
  [4, 12002, 7, 2, '2025-04-20', 600000, 'rechazada', null],
  [5, 12004, 10, 1, '2024-11-15', 700000, 'en alquiler', 'C-0002'],
  [6, 12004, 5, 2, '2023-10-01', 520000, 'finalizada', 'C-0000'],
  [7, 12005, 4, 3, '2025-09-02', 400000, 'pendiente', null],
  [8, 12003, 7, 2, '2025-06-01', 880000, 'rechazada', null],
];

const TIPOS_DE_GARANTIA = [[1, 'recibo de sueldo'], [2, 'propietaria'], [3, 'seguro de caución']];

// [id_solicitud, id_garante, id_tipo_garantia, estado, fecha_alta, fecha_baja]
const GARANTIAS = [
  [1, 8, 1, 'aprobada', '2025-02-11', null],
  [2, 9, 1, 'rechazada', '2025-02-13', '2025-02-20'],
  [3, 8, 2, 'pendiente', '2025-04-05', null],
  [3, 10, 3, 'aprobada', '2025-04-06', null],
  [4, 9, 2, 'rechazada', '2025-04-21', '2025-04-28'],
  [5, 9, 1, 'aprobada', '2024-11-16', null],
  [7, 10, 1, 'pendiente', '2025-09-03', null],
  [8, 8, 3, 'rechazada', '2025-06-02', '2025-06-10'],
];

// [id_propiedad, fecha_hora_visita, id_agente]
const VISITAS = [
  [12001, '2025-02-05 09:30:00', 1],
  [12002, '2025-03-20 10:00:00', 2],
  [12002, '2025-04-02 17:30:00', 2],
  [12003, '2025-05-30 11:00:00', 2],
  [12005, '2025-08-25 16:00:00', 1],
  [12003, '2026-10-12 12:00:00', 3],
];

// [id_agente, id_propiedad, fecha_hora_desde, fecha_hora_hasta]: without an end, still assigned.
const ASIGNACIONES = [
  [1, 12001, '2025-01-01 09:00:00', null],
  [1, 12004, '2024-11-01 09:00:00', null],
  [1, 12005, '2025-08-01 09:00:00', null],
  [2, 12002, '2025-03-01 09:00:00', null],
  [2, 12003, '2025-05-15 09:00:00', '2026-09-30 18:00:00'],
  [3, 12003, '2025-10-01 09:00:00', null],
  [3, 12006, '2025-02-01 09:00:00', '2025-12-31 18:00:00'],
];

const texto = (t) => `'${String(t).replace(/'/g, "''")}'`;
const valor = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : texto(v));
const filas = (lista) => lista.map((f) => `(${f.map(valor).join(', ')})`).join(',\n  ');

export const BASE_DE_EJEMPLO = `PRAGMA foreign_keys = ON;
CREATE TABLE persona (
  id INTEGER PRIMARY KEY,
  tipo_doc VARCHAR(10) NOT NULL,
  nro_doc VARCHAR(20) NOT NULL,
  nombre VARCHAR(45) NOT NULL,
  apellido VARCHAR(45) NOT NULL,
  domicilio VARCHAR(100),
  telefono VARCHAR(20),
  email VARCHAR(100),
  cuil VARCHAR(11),
  matricula VARCHAR(10),
  UNIQUE (tipo_doc, nro_doc)
);
CREATE TABLE propiedad (
  id INTEGER PRIMARY KEY,
  direccion VARCHAR(100) NOT NULL,
  zona VARCHAR(45) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  situacion VARCHAR(20) NOT NULL
);
CREATE TABLE valor_propiedad (
  id_propiedad INT NOT NULL REFERENCES propiedad (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  fecha_hora_desde DATETIME NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id_propiedad, fecha_hora_desde)
);
CREATE TABLE solicitud_contrato (
  id INTEGER PRIMARY KEY,
  id_propiedad INT NOT NULL REFERENCES propiedad (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_cliente INT NOT NULL REFERENCES persona (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_agente INT NOT NULL REFERENCES persona (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  fecha_solicitud DATE NOT NULL,
  importe_mensual DECIMAL(10,2) NOT NULL,
  estado VARCHAR(20) NOT NULL,
  nro_contrato VARCHAR(10)
);
CREATE TABLE tipo_garantia (
  id INTEGER PRIMARY KEY,
  nombre VARCHAR(45) NOT NULL
);
CREATE TABLE garantia (
  id_solicitud INT NOT NULL REFERENCES solicitud_contrato (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_garante INT NOT NULL REFERENCES persona (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_tipo_garantia INT NOT NULL REFERENCES tipo_garantia (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  estado VARCHAR(20) NOT NULL,
  fecha_alta DATE NOT NULL,
  fecha_baja DATE,
  PRIMARY KEY (id_solicitud, id_garante)
);
CREATE TABLE visita (
  id_propiedad INT NOT NULL REFERENCES propiedad (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  fecha_hora_visita DATETIME NOT NULL,
  id_agente INT NOT NULL REFERENCES persona (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY (id_propiedad, fecha_hora_visita)
);
CREATE TABLE agente_asignado (
  id_agente INT NOT NULL REFERENCES persona (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_propiedad INT NOT NULL REFERENCES propiedad (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  fecha_hora_desde DATETIME NOT NULL,
  fecha_hora_hasta DATETIME,
  PRIMARY KEY (id_agente, id_propiedad, fecha_hora_desde)
);
INSERT INTO persona VALUES
  ${filas(PERSONAS)};
INSERT INTO propiedad VALUES
  ${filas(PROPIEDADES)};
INSERT INTO valor_propiedad VALUES
  ${filas(VALORES)};
INSERT INTO solicitud_contrato VALUES
  ${filas(SOLICITUDES)};
INSERT INTO tipo_garantia VALUES
  ${filas(TIPOS_DE_GARANTIA)};
INSERT INTO garantia VALUES
  ${filas(GARANTIAS)};
INSERT INTO visita VALUES
  ${filas(VISITAS)};
INSERT INTO agente_asignado VALUES
  ${filas(ASIGNACIONES)};
`;
