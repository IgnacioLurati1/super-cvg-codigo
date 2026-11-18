// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { visorDe } from './drivePublico';
import { claseDeFormato, leerCsv, leerXlsx, letrasDe, textoDeCsv, textoDeNumero, tipoDePlanilla, TOPES } from './planilla';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

// A small .xlsx as Excel writes it: two visible sheets and a hidden one, shared strings and number formats.
function libro({ hojas, compartidas = [], estilos = '', fecha1904 = false }) {
  const archivos = {
    'xl/workbook.xml': `<workbook ${NS}>${fecha1904 ? '<workbookPr date1904="1"/>' : ''}<sheets>${hojas
      .map((h, i) => `<sheet name="${h.nombre}" sheetId="${i + 1}" r:id="rId${i + 1}"${h.oculta ? ' state="hidden"' : ''}/>`)
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
      .map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}</Relationships>`,
    'xl/sharedStrings.xml': `<sst ${NS}>${compartidas.map((s) => `<si>${s}</si>`).join('')}</sst>`,
    'xl/styles.xml': `<styleSheet ${NS}>${estilos}</styleSheet>`,
    '[Content_Types].xml': '<Types/>',
  };
  hojas.forEach((h, i) => { archivos[`xl/worksheets/sheet${i + 1}.xml`] = `<worksheet ${NS}><sheetData>${h.datos}</sheetData>${h.extra ?? ''}</worksheet>`; });
  return zipSync(Object.fromEntries(Object.entries(archivos).map(([k, v]) => [k, strToU8(v)])));
}

const textos = (hoja) => hoja.leer().filas.map((f) => f.map((c) => c?.texto ?? ''));

describe('planillas', () => {
  it('reconoce el tipo por el nombre o el tipo del archivo', () => {
    expect(tipoDePlanilla({ mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', archivo: 'x' })).toBe('xlsx');
    expect(tipoDePlanilla({ mime: '', archivo: 'Notas.XLSM' })).toBe('xlsx');
    expect(tipoDePlanilla({ mime: 'application/octet-stream', archivo: 'datos.csv' })).toBe('csv');
    expect(tipoDePlanilla({ mime: 'application/vnd.ms-excel', archivo: 'viejo.xls' })).toBe(null);
    expect(tipoDePlanilla({ mime: 'application/pdf', archivo: 'a.pdf' })).toBe(null);
  });

  it('Drive abre como planilla lo mismo que el visor', () => {
    for (const [m, n] of [['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a'], ['', 'b.xlsm'], ['text/csv', 'c'], ['', 'd.CSV'], ['application/vnd.ms-excel', 'e.xls'], ['', 'f.ods']]) {
      expect(visorDe({ m, n }) === 'planilla', `${m} ${n}`).toBe(tipoDePlanilla({ mime: m, archivo: n }) !== null);
    }
  });

  it('lee cada hoja visible con sus textos, números, fórmulas y celdas unidas', () => {
    const bytes = libro({
      compartidas: ['<t>Alumno</t>', '<r><t>Nota </t></r><r><t>final</t></r><rPh><t>x</t></rPh>', '<t>Ana &amp; Juan</t>'],
      estilos: '<numFmts><numFmt numFmtId="164" formatCode="0.0"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/><xf numFmtId="10"/><xf numFmtId="4"/></cellXfs>',
      hojas: [
        {
          nombre: 'Notas',
          datos: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
            + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>7.25</v></c><c r="C2" s="2"><v>46000</v></c></row>'
            + '<row r="4"><c r="A4" t="inlineStr"><is><t>Promedio</t></is></c><c r="B4" s="1"><f>AVERAGE(B2:B3)</f><v>7.25</v></c><c r="D4" t="b"><v>1</v></c></row>'
            + '<row r="5"><c r="A5" s="3"><v>0.125</v></c><c r="B5" s="4"><v>1234567.891</v></c><c r="C5" t="e"><v>#DIV/0!</v></c><c r="D5"><v>0.1</v></c></row>',
          extra: '<mergeCells><mergeCell ref="B1:C1"/></mergeCells>',
        },
        { nombre: 'Escondida', oculta: true, datos: '<row r="1"><c r="A1" t="inlineStr"><is><t>no</t></is></c></row>' },
        { nombre: 'Vacía', datos: '' },
      ],
    });
    const hojas = leerXlsx(bytes);
    expect(hojas.map((h) => h.nombre)).toEqual(['Notas', 'Vacía']);
    expect(textos(hojas[0])).toEqual([
      ['Alumno', 'Nota final', '', ''],
      ['Ana & Juan', '7,3', '09/12/2025', ''],
      ['', '', '', ''],
      ['Promedio', '7,3', '', 'VERDADERO'],
      ['12,50%', '1.234.567,89', '#DIV/0!', '0,1'],
    ]);
    expect(hojas[0].leer().filas[1][1].numero).toBe(true);
    expect(hojas[0].leer().filas[1][2].numero).toBe(false);
    expect(hojas[0].leer().unidas).toEqual([{ fila: 0, columna: 1, filas: 1, columnas: 2 }]);
    expect(hojas[1].leer().filas).toEqual([]);
  });

  it('las fechas de un libro de 1904 y los formatos propios de fecha y hora', () => {
    const bytes = libro({
      fecha1904: true,
      estilos: '<numFmts><numFmt numFmtId="165" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="165"/></cellXfs>',
      hojas: [{ nombre: 'H', datos: '<row r="1"><c r="A1" s="1"><v>44538.5</v></c></row>' }],
    });
    expect(textos(leerXlsx(bytes)[0])).toEqual([['09/12/2025 12:00']]);
  });

  it('los formatos de número, como los muestra Excel', () => {
    expect(textoDeNumero(0.1 + 0.2, claseDeFormato(0))).toBe('0,3');
    expect(textoDeNumero(45.5, claseDeFormato(164, '"$"#,##0.00'))).toBe('$ 45,50');
    expect(textoDeNumero(0.5, claseDeFormato(20))).toBe('12:00');
    expect(textoDeNumero(46000, claseDeFormato(170, '[$-2C0A]dddd, d" de "mmmm" de "yyyy'))).toBe('09/12/2025');
    expect(textoDeNumero(0.0208333, claseDeFormato(171, 'mm:ss'))).toBe('00:30:00');
    expect(textoDeNumero(12345, claseDeFormato(11))).toBe('1,23E+4');
  });

  it('deja afuera lo que pasa de los topes y lo avisa', () => {
    const datos = Array.from({ length: TOPES.filas + 3 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join('')
      + `<row r="1"><c r="${letrasDe(TOPES.columnas)}1"><v>1</v></c></row>`;
    const hoja = leerXlsx(libro({ hojas: [{ nombre: 'Larga', datos }] }))[0].leer();
    expect(hoja.filas).toHaveLength(TOPES.filas);
    expect(hoja.recortada).toBe(true);
  });

  it('un archivo que no es planilla falla', () => {
    expect(() => leerXlsx(zipSync({ 'a.txt': strToU8('hola') }))).toThrow();
    expect(() => leerXlsx(strToU8('no es un zip'))).toThrow();
  });

  it('nombra las columnas como Excel', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(letrasDe)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('un CSV de Excel en castellano: punto y coma, comillas y Windows-1252', () => {
    const bytes = Uint8Array.from([...'Materia;Nota\r\n"Física; I";8\r\n"Dice ""hola""";7,5\r\n\r\n'].map((c) => (c === 'í' ? 0xed : c.charCodeAt(0))));
    const [hoja] = leerCsv(textoDeCsv(bytes));
    expect(textos(hoja)).toEqual([['Materia', 'Nota'], ['Física; I', '8'], ['Dice "hola"', '7,5']]);
    expect(hoja.leer().filas[2][1].numero).toBe(true);
  });

  it('un CSV con comas en UTF-8 con BOM', () => {
    const [hoja] = leerCsv(textoDeCsv(strToU8('﻿a,b,c\n1,,3')));
    expect(textos(hoja)).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });
});
