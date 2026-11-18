-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 16-11-2026 a las 17:20:41
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `inmobiliaria`
--

DELIMITER $$
--
-- Procedimientos
--
CREATE DEFINER=`root`@`localhost` PROCEDURE `visitas_de` (IN `p_id` INT)   BEGIN
  SELECT * FROM visita WHERE id_persona = p_id;
END$$

--
-- Funciones
--
CREATE DEFINER=`root`@`localhost` FUNCTION `precio_dolar` (`p` DOUBLE) RETURNS DOUBLE DETERMINISTIC BEGIN
  RETURN p / 1000;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `persona`
--

CREATE TABLE `persona` (
  `id` int(10) UNSIGNED NOT NULL,
  `dni` int(10) UNSIGNED NOT NULL,
  `apellido` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `email` varchar(120) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `tipo` enum('cliente','inquilino','propietario') NOT NULL DEFAULT 'cliente',
  `intereses` set('casa','depto','local') DEFAULT NULL,
  `nota` text DEFAULT NULL COMMENT 'Lo que diga el vendedor',
  `alta` datetime NOT NULL DEFAULT current_timestamp(),
  `cambio` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `nacimiento` year(4) DEFAULT NULL,
  `el orden` int(11) DEFAULT NULL,
  `order` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `persona`
--

INSERT INTO `persona` (`id`, `dni`, `apellido`, `nombre`, `email`, `activo`, `tipo`, `intereses`, `nota`, `alta`, `cambio`, `nacimiento`, `el orden`, `order`) VALUES
(100, 30111222, 'O\'Brien', 'Ana', 'ana@ejemplo.com', 1, 'cliente', 'casa,depto', 'Dice \"ya vuelvo\";\nllamar a la tarde', '2026-11-16 16:57:09', '2026-11-16 19:57:09', '1990', 1, 2),
(101, 28999000, 'Pérez', 'Bruno', NULL, 1, 'propietario', NULL, 'Ruta C:\\Docs\\contrato.pdf y un 50% de seña', '2026-11-16 16:57:09', '2026-11-16 19:57:09', '1985', NULL, NULL),
(102, 35123456, 'Núñez', 'Carla 😀', 'carla@ejemplo.com', 1, 'inquilino', 'local', NULL, '2026-11-16 16:57:09', '2026-11-16 19:57:09', NULL, 3, 4),
(103, 40111000, 'D\'Alessandro', 'Diego', 'diego@ejemplo.com', 1, 'cliente', '', 'Tab\taquí -- no es comentario /* tampoco */ # ni esto', '2026-11-16 16:57:09', '2026-11-16 19:57:09', '2001', 5, 6);

--
-- Disparadores `persona`
--
DELIMITER $$
CREATE TRIGGER `persona_au` AFTER UPDATE ON `persona` FOR EACH ROW BEGIN
  INSERT INTO log_cambios (tabla) VALUES ('persona');
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `propiedad`
--

CREATE TABLE `propiedad` (
  `id` int(10) UNSIGNED NOT NULL,
  `direccion` varchar(100) NOT NULL,
  `id_zona` smallint(5) UNSIGNED NOT NULL,
  `id_propietario` int(10) UNSIGNED NOT NULL,
  `superficie` decimal(8,2) UNSIGNED NOT NULL CHECK (`superficie` > 0),
  `precio` double DEFAULT NULL,
  `situacion` enum('en oferta','alquilada','vendida') NOT NULL DEFAULT 'en oferta',
  `apta_credito` bit(1) NOT NULL DEFAULT b'0',
  `datos` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`datos`)),
  `foto` mediumblob DEFAULT NULL,
  `precio_m2` decimal(12,2) GENERATED ALWAYS AS (`precio` / `superficie`) VIRTUAL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `propiedad`
--

INSERT INTO `propiedad` (`id`, `direccion`, `id_zona`, `id_propietario`, `superficie`, `precio`, `situacion`, `apta_credito`, `datos`, `foto`) VALUES
(1, 'Córdoba 1234, 3° B', 1, 101, 45.50, 120000, 'en oferta', b'1', '{\"ambientes\": 2, \"balcon\": true}', 0x89504e470d0a1a0a),
(2, 'Av. Eva Perón 8000', 2, 101, 300.00, 350000.75, 'vendida', b'0', NULL, NULL),
(3, 'Mendoza 3500', 4, 102, 80.00, NULL, 'alquilada', b'0', '{\"nota\": \"it\'s ok\"}', NULL);

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `propiedades_en_oferta`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `propiedades_en_oferta` (
`id` int(10) unsigned
,`direccion` varchar(100)
,`zona` varchar(60)
,`precio` double
);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `visita`
--

CREATE TABLE `visita` (
  `id_propiedad` int(10) UNSIGNED NOT NULL,
  `id_persona` int(10) UNSIGNED NOT NULL,
  `fecha_hora` datetime(3) NOT NULL,
  `comentario` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `visita`
--

INSERT INTO `visita` (`id_propiedad`, `id_persona`, `fecha_hora`, `comentario`) VALUES
(1, 100, '2026-03-01 10:30:00.250', 'Le gustó; vuelve el lunes'),
(1, 102, '2026-03-02 18:00:00.000', NULL),
(2, 103, '2026-04-10 09:15:00.000', 'Pidió \\ descuento');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `zona`
--

CREATE TABLE `zona` (
  `id` smallint(5) UNSIGNED NOT NULL,
  `nombre` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='Barrios';

--
-- Volcado de datos para la tabla `zona`
--

INSERT INTO `zona` (`id`, `nombre`) VALUES
(1, 'Centro'),
(4, 'Echesortu'),
(2, 'Fisherton'),
(3, 'Pichincha');

-- --------------------------------------------------------

--
-- Estructura para la vista `propiedades_en_oferta`
--
DROP TABLE IF EXISTS `propiedades_en_oferta`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `propiedades_en_oferta`  AS SELECT `p`.`id` AS `id`, `p`.`direccion` AS `direccion`, `z`.`nombre` AS `zona`, `p`.`precio` AS `precio` FROM (`propiedad` `p` join `zona` `z` on(`z`.`id` = `p`.`id_zona`)) WHERE `p`.`situacion` = 'en oferta' ;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `persona`
--
ALTER TABLE `persona`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_dni` (`dni`),
  ADD KEY `idx_apellido` (`apellido`(20),`nombre`);
ALTER TABLE `persona` ADD FULLTEXT KEY `ft_nota` (`nota`);

--
-- Indices de la tabla `propiedad`
--
ALTER TABLE `propiedad`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_propiedad_zona` (`id_zona`),
  ADD KEY `fk_propiedad_persona` (`id_propietario`);

--
-- Indices de la tabla `visita`
--
ALTER TABLE `visita`
  ADD PRIMARY KEY (`id_propiedad`,`id_persona`,`fecha_hora`),
  ADD KEY `fk_visita_persona` (`id_persona`);

--
-- Indices de la tabla `zona`
--
ALTER TABLE `zona`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_zona_nombre` (`nombre`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `persona`
--
ALTER TABLE `persona`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=104;

--
-- AUTO_INCREMENT de la tabla `propiedad`
--
ALTER TABLE `propiedad`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT de la tabla `zona`
--
ALTER TABLE `zona`
  MODIFY `id` smallint(5) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `propiedad`
--
ALTER TABLE `propiedad`
  ADD CONSTRAINT `fk_propiedad_persona` FOREIGN KEY (`id_propietario`) REFERENCES `persona` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_propiedad_zona` FOREIGN KEY (`id_zona`) REFERENCES `zona` (`id`);

--
-- Filtros para la tabla `visita`
--
ALTER TABLE `visita`
  ADD CONSTRAINT `fk_visita_persona` FOREIGN KEY (`id_persona`) REFERENCES `persona` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_visita_propiedad` FOREIGN KEY (`id_propiedad`) REFERENCES `propiedad` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
