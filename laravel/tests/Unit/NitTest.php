<?php

namespace Tests\Unit;

use App\Support\Nit;
use PHPUnit\Framework\TestCase;

/**
 * A4-09: App\Support\Nit da lo mismo que normalizarNit de la API. Casos copiados uno a uno de
 * api/test/validaciones.test.js («B1-06 normalizarNit»), con el mismo nombre de cada prueba.
 */
class NitTest extends TestCase
{
    private function valido(?string $nit): array
    {
        return ['valido' => true, 'nit' => $nit];
    }

    private const INVALIDO = ['valido' => false, 'nit' => null];

    public function test_acepta_el_nit_del_contrato_con_verificador_k(): void
    {
        $this->assertSame($this->valido('4521817K'), Nit::normalizar('4521817K'));
    }

    public function test_el_nit_compacto_tiene_entre_2_y_12_caracteres(): void
    {
        // 12345678901 + verificador 6 = 12 caracteres, válido; 123456789012 + 0 = 13, rechazado.
        $this->assertSame($this->valido('123456789016'), Nit::normalizar('123456789016'));
        $this->assertSame(self::INVALIDO, Nit::normalizar('1234567890120'));
        $this->assertSame($this->valido('123456789016'), Nit::normalizar('00-1234567890-16'), 'los ceros iniciales no cuentan');
        $this->assertSame(self::INVALIDO, Nit::normalizar('1'), 'un solo carácter no tiene cuerpo');
    }

    public function test_acepta_un_nit_con_verificador_numerico(): void
    {
        // 1234567: 1·8+2·7+3·6+4·5+5·4+6·3+7·2 = 112; 112 % 11 = 2; 11-2 = 9
        $this->assertSame($this->valido('12345679'), Nit::normalizar('12345679'));
    }

    public function test_acepta_un_nit_cuyo_verificador_calculado_es_0(): void
    {
        // Cuerpo 45: 4·3 + 5·2 = 22; 22 % 11 = 0; (11 - 0) % 11 = 0 → verificador "0"
        $this->assertSame($this->valido('450'), Nit::normalizar('450'));
    }

    public function test_elimina_espacios_y_guiones_y_pasa_a_mayusculas(): void
    {
        $this->assertSame($this->valido('4521817K'), Nit::normalizar(' 4521817-k '));
        $this->assertSame($this->valido('4521817K'), Nit::normalizar('452 181 7-K'));
    }

    public function test_elimina_los_ceros_iniciales(): void
    {
        $this->assertSame($this->valido('4521817K'), Nit::normalizar('004521817K'));
    }

    public function test_cf_se_representa_como_null(): void
    {
        $this->assertSame($this->valido(null), Nit::normalizar('CF'));
        $this->assertSame($this->valido(null), Nit::normalizar(' cf '));
        $this->assertSame($this->valido(null), Nit::normalizar('C-F'));
    }

    public function test_rechaza_un_digito_verificador_incorrecto(): void
    {
        $this->assertSame(self::INVALIDO, Nit::normalizar('45218170'));
        $this->assertSame(self::INVALIDO, Nit::normalizar('12345678'));
    }

    public function test_rechaza_formatos_invalidos(): void
    {
        foreach (['', '   ', 'K', '0', '000', '45K1817', 'K4521817', '4521.817K', 'ABC', '4521817KK'] as $valor) {
            $this->assertFalse(Nit::normalizar($valor)['valido'], 'debería rechazar '.json_encode($valor));
        }
    }

    public function test_rechaza_valores_que_no_son_texto(): void
    {
        foreach ([null, 4521817, new \stdClass, []] as $valor) {
            $this->assertSame(self::INVALIDO, Nit::normalizar($valor));
        }
    }
}
