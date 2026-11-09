<?php

namespace Tests\Unit;

use App\Support\Telefono;
use PHPUnit\Framework\TestCase;

/**
 * A4-09: App\Support\Telefono da lo mismo que normalizarTelefono de la API. Casos copiados uno a uno de
 * api/test/validaciones.test.js («B1-07 normalizarTelefono»), con el mismo nombre de cada prueba.
 */
class TelefonoTest extends TestCase
{
    private const INVALIDO = ['valido' => false, 'telefono' => null];

    private function valido(string $telefono): array
    {
        return ['valido' => true, 'telefono' => $telefono];
    }

    public function test_acepta_8_digitos_que_empiezan_por_2_a_9(): void
    {
        $this->assertSame($this->valido('55551234'), Telefono::normalizar('55551234'));
        $this->assertSame($this->valido('22334455'), Telefono::normalizar('22334455'));
        $this->assertSame($this->valido('99887766'), Telefono::normalizar('99887766'));
    }

    public function test_elimina_separadores(): void
    {
        foreach (['5555-1234', '5555 1234', '5555.1234', '(5555) 1234', ' 5555 - 1234 '] as $valor) {
            $this->assertSame($this->valido('55551234'), Telefono::normalizar($valor), $valor);
        }
    }

    public function test_elimina_el_prefijo_de_guatemala(): void
    {
        foreach (['+502 5555 1234', '+50255551234', '502-5555-1234', '50255551234', '(+502) 5555-1234'] as $valor) {
            $this->assertSame($this->valido('55551234'), Telefono::normalizar($valor), $valor);
        }
    }

    public function test_no_recorta_un_numero_local_de_8_digitos_que_empieza_por_502(): void
    {
        $this->assertSame($this->valido('50212345'), Telefono::normalizar('50212345'));
    }

    public function test_rechaza_telefonos_invalidos(): void
    {
        foreach (['5555123', '555512345', '05551234', '15551234', '5555ABCD', '', '+1 5555 1234', '+502 1555 1234', '+5025555123'] as $valor) {
            $this->assertFalse(Telefono::normalizar($valor)['valido'], 'debería rechazar '.json_encode($valor));
        }
    }

    public function test_rechaza_valores_que_no_son_texto(): void
    {
        foreach ([null, 55551234, new \stdClass] as $valor) {
            $this->assertSame(self::INVALIDO, Telefono::normalizar($valor));
        }
    }
}
