-- MySQL Workbench Forward Engineering

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- -----------------------------------------------------
-- Schema facultad
-- -----------------------------------------------------

-- -----------------------------------------------------
-- Schema facultad
-- -----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `facultad` DEFAULT CHARACTER SET utf8mb4 ;
USE `facultad` ;

-- -----------------------------------------------------
-- Table `facultad`.`carrera`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `facultad`.`carrera` (
  `idcarrera` INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(45) NOT NULL,
  `plan` YEAR NULL DEFAULT NULL,
  PRIMARY KEY (`idcarrera`),
  UNIQUE INDEX `nombre_UNIQUE` (`nombre` ASC) VISIBLE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4;


-- -----------------------------------------------------
-- Table `facultad`.`alumno`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `facultad`.`alumno` (
  `legajo` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(45) NULL,
  `promedio` DECIMAL(4,2) NULL DEFAULT 0.00,
  `regular` TINYINT NOT NULL DEFAULT 1,
  `carrera_idcarrera` INT NOT NULL,
  PRIMARY KEY (`legajo`),
  INDEX `fk_alumno_carrera_idx` (`carrera_idcarrera` ASC) VISIBLE,
  CONSTRAINT `fk_alumno_carrera`
    FOREIGN KEY (`carrera_idcarrera`)
    REFERENCES `facultad`.`carrera` (`idcarrera`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `facultad`.`inscripcion`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `facultad`.`inscripcion` (
  `alumno_legajo` INT UNSIGNED NOT NULL,
  `materia` VARCHAR(60) NOT NULL,
  `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`alumno_legajo`, `materia`),
  CONSTRAINT `fk_inscripcion_alumno1`
    FOREIGN KEY (`alumno_legajo`)
    REFERENCES `facultad`.`alumno` (`legajo`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB;

USE `facultad` ;

-- -----------------------------------------------------
-- Placeholder table for view `facultad`.`regulares`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `facultad`.`regulares` (`legajo` INT, `nombre` INT, `carrera` INT);

-- -----------------------------------------------------
-- View `facultad`.`regulares`
-- -----------------------------------------------------
DROP TABLE IF EXISTS `facultad`.`regulares`;
USE `facultad`;
CREATE  OR REPLACE VIEW `regulares` AS
SELECT a.legajo, a.nombre, c.nombre AS carrera
FROM alumno a JOIN carrera c ON c.idcarrera = a.carrera_idcarrera
WHERE a.regular = 1;

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;

-- -----------------------------------------------------
-- Data for table `facultad`.`carrera`
-- -----------------------------------------------------
START TRANSACTION;
USE `facultad`;
INSERT INTO `facultad`.`carrera` (`idcarrera`, `nombre`, `plan`) VALUES (DEFAULT, 'Ingeniería en Sistemas', 2023);
INSERT INTO `facultad`.`carrera` (`idcarrera`, `nombre`, `plan`) VALUES (DEFAULT, 'Ingeniería Civil', NULL);

COMMIT;


-- -----------------------------------------------------
-- Data for table `facultad`.`alumno`
-- -----------------------------------------------------
START TRANSACTION;
USE `facultad`;
INSERT INTO `facultad`.`alumno` (`legajo`, `nombre`, `promedio`, `regular`, `carrera_idcarrera`) VALUES (51234, 'Ana O\'Connor', 8.50, DEFAULT, 1);
INSERT INTO `facultad`.`alumno` (`legajo`, `nombre`, `promedio`, `regular`, `carrera_idcarrera`) VALUES (51235, 'Bruno Díaz', DEFAULT, 0, 2);

COMMIT;


-- -----------------------------------------------------
-- Data for table `facultad`.`inscripcion`
-- -----------------------------------------------------
START TRANSACTION;
USE `facultad`;
INSERT INTO `facultad`.`inscripcion` (`alumno_legajo`, `materia`, `fecha`) VALUES (51234, 'Bases de Datos', '2026-03-10 09:00:00');
INSERT INTO `facultad`.`inscripcion` (`alumno_legajo`, `materia`, `fecha`) VALUES (51235, 'Análisis Matemático I', DEFAULT);

COMMIT;
