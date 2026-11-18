
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `log_cambios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `log_cambios` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tabla` varchar(30) NOT NULL,
  `cuando` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=MyISAM AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `log_cambios` WRITE;
/*!40000 ALTER TABLE `log_cambios` DISABLE KEYS */;
INSERT INTO `log_cambios` (`id`, `tabla`, `cuando`) VALUES (1,'persona','2026-11-16 19:57:09.160501');
/*!40000 ALTER TABLE `log_cambios` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `persona`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `persona` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `dni` int unsigned NOT NULL,
  `apellido` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `email` varchar(120) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `tipo` enum('cliente','inquilino','propietario') NOT NULL DEFAULT 'cliente',
  `intereses` set('casa','depto','local') DEFAULT NULL,
  `nota` text COMMENT 'Lo que diga el vendedor',
  `alta` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cambio` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `nacimiento` year DEFAULT NULL,
  `el orden` int DEFAULT NULL,
  `order` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dni` (`dni`),
  KEY `idx_apellido` (`apellido`(20),`nombre`),
  FULLTEXT KEY `ft_nota` (`nota`)
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `persona` WRITE;
/*!40000 ALTER TABLE `persona` DISABLE KEYS */;
INSERT INTO `persona` (`id`, `dni`, `apellido`, `nombre`, `email`, `activo`, `tipo`, `intereses`, `nota`, `alta`, `cambio`, `nacimiento`, `el orden`, `order`) VALUES (100,30111222,'O\'Brien','Ana','ana@ejemplo.com',1,'cliente','casa,depto','Dice \"ya vuelvo\";\nllamar a la tarde','2026-11-16 16:57:09','2026-11-16 19:57:09',1990,1,2);
INSERT INTO `persona` (`id`, `dni`, `apellido`, `nombre`, `email`, `activo`, `tipo`, `intereses`, `nota`, `alta`, `cambio`, `nacimiento`, `el orden`, `order`) VALUES (101,28999000,'Pérez','Bruno',NULL,1,'propietario',NULL,'Ruta C:\\Docs\\contrato.pdf y un 50% de seña','2026-11-16 16:57:09','2026-11-16 19:57:09',1985,NULL,NULL);
INSERT INTO `persona` (`id`, `dni`, `apellido`, `nombre`, `email`, `activo`, `tipo`, `intereses`, `nota`, `alta`, `cambio`, `nacimiento`, `el orden`, `order`) VALUES (102,35123456,'Núñez','Carla 😀','carla@ejemplo.com',1,'inquilino','local',NULL,'2026-11-16 16:57:09','2026-11-16 19:57:09',NULL,3,4);
INSERT INTO `persona` (`id`, `dni`, `apellido`, `nombre`, `email`, `activo`, `tipo`, `intereses`, `nota`, `alta`, `cambio`, `nacimiento`, `el orden`, `order`) VALUES (103,40111000,'D\'Alessandro','Diego','diego@ejemplo.com',1,'cliente','','Tab	aquí -- no es comentario /* tampoco */ # ni esto','2026-11-16 16:57:09','2026-11-16 19:57:09',2001,5,6);
/*!40000 ALTER TABLE `persona` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `persona_au` AFTER UPDATE ON `persona` FOR EACH ROW BEGIN
  INSERT INTO log_cambios (tabla) VALUES ('persona');
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
DROP TABLE IF EXISTS `propiedad`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `propiedad` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `direccion` varchar(100) NOT NULL,
  `id_zona` smallint unsigned NOT NULL,
  `id_propietario` int unsigned NOT NULL,
  `superficie` decimal(8,2) unsigned NOT NULL,
  `precio` double DEFAULT NULL,
  `situacion` enum('en oferta','alquilada','vendida') NOT NULL DEFAULT 'en oferta',
  `apta_credito` bit(1) NOT NULL DEFAULT b'0',
  `datos` json DEFAULT NULL,
  `foto` mediumblob,
  `precio_m2` decimal(12,2) GENERATED ALWAYS AS ((`precio` / `superficie`)) VIRTUAL,
  PRIMARY KEY (`id`),
  KEY `fk_propiedad_zona` (`id_zona`),
  KEY `fk_propiedad_persona` (`id_propietario`),
  CONSTRAINT `fk_propiedad_persona` FOREIGN KEY (`id_propietario`) REFERENCES `persona` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_propiedad_zona` FOREIGN KEY (`id_zona`) REFERENCES `zona` (`id`),
  CONSTRAINT `chk_superficie` CHECK ((`superficie` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `propiedad` WRITE;
/*!40000 ALTER TABLE `propiedad` DISABLE KEYS */;
INSERT INTO `propiedad` (`id`, `direccion`, `id_zona`, `id_propietario`, `superficie`, `precio`, `situacion`, `apta_credito`, `datos`, `foto`) VALUES (1,'Córdoba 1234, 3° B',1,101,45.50,120000,'en oferta',0x01,'{\"balcon\": true, \"ambientes\": 2}',0x89504E470D0A1A0A);
INSERT INTO `propiedad` (`id`, `direccion`, `id_zona`, `id_propietario`, `superficie`, `precio`, `situacion`, `apta_credito`, `datos`, `foto`) VALUES (2,'Av. Eva Perón 8000',2,101,300.00,350000.75,'vendida',0x00,NULL,NULL);
INSERT INTO `propiedad` (`id`, `direccion`, `id_zona`, `id_propietario`, `superficie`, `precio`, `situacion`, `apta_credito`, `datos`, `foto`) VALUES (3,'Mendoza 3500',4,102,80.00,NULL,'alquilada',0x00,'{\"nota\": \"it\'s ok\"}',NULL);
/*!40000 ALTER TABLE `propiedad` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `propiedades_en_oferta`;
/*!50001 DROP VIEW IF EXISTS `propiedades_en_oferta`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `propiedades_en_oferta` AS SELECT 
 1 AS `id`,
 1 AS `direccion`,
 1 AS `zona`,
 1 AS `precio`*/;
SET character_set_client = @saved_cs_client;
DROP TABLE IF EXISTS `visita`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visita` (
  `id_propiedad` int unsigned NOT NULL,
  `id_persona` int unsigned NOT NULL,
  `fecha_hora` datetime(3) NOT NULL,
  `comentario` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_propiedad`,`id_persona`,`fecha_hora`),
  KEY `fk_visita_persona` (`id_persona`),
  CONSTRAINT `fk_visita_persona` FOREIGN KEY (`id_persona`) REFERENCES `persona` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_visita_propiedad` FOREIGN KEY (`id_propiedad`) REFERENCES `propiedad` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `visita` WRITE;
/*!40000 ALTER TABLE `visita` DISABLE KEYS */;
INSERT INTO `visita` (`id_propiedad`, `id_persona`, `fecha_hora`, `comentario`) VALUES (1,100,'2026-03-01 10:30:00.250','Le gustó; vuelve el lunes');
INSERT INTO `visita` (`id_propiedad`, `id_persona`, `fecha_hora`, `comentario`) VALUES (1,102,'2026-03-02 18:00:00.000',NULL);
INSERT INTO `visita` (`id_propiedad`, `id_persona`, `fecha_hora`, `comentario`) VALUES (2,103,'2026-04-10 09:15:00.000','Pidió \\ descuento');
/*!40000 ALTER TABLE `visita` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `zona`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `zona` (
  `id` smallint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_zona_nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Barrios';
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `zona` WRITE;
/*!40000 ALTER TABLE `zona` DISABLE KEYS */;
INSERT INTO `zona` (`id`, `nombre`) VALUES (1,'Centro');
INSERT INTO `zona` (`id`, `nombre`) VALUES (4,'Echesortu');
INSERT INTO `zona` (`id`, `nombre`) VALUES (2,'Fisherton');
INSERT INTO `zona` (`id`, `nombre`) VALUES (3,'Pichincha');
/*!40000 ALTER TABLE `zona` ENABLE KEYS */;
UNLOCK TABLES;
/*!50001 DROP VIEW IF EXISTS `propiedades_en_oferta`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `propiedades_en_oferta` AS select `p`.`id` AS `id`,`p`.`direccion` AS `direccion`,`z`.`nombre` AS `zona`,`p`.`precio` AS `precio` from (`propiedad` `p` join `zona` `z` on((`z`.`id` = `p`.`id_zona`))) where (`p`.`situacion` = 'en oferta') */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

