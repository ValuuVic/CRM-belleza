<?php

namespace Tests;

use Database\Seeders\VerificacionSeeder;
use Illuminate\Foundation\Testing\Attributes\Seed;
use Illuminate\Foundation\Testing\Attributes\Seeder;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

/**
 * Las pruebas con RefreshDatabase corren sobre MySQL (crm_belleza_test, phpunit.xml) con la semilla
 * oficial cargada: Alicia (1), Sergio (2), Sandra (3), Valeria (4), Diego (5), Carlos (6), Iván (7).
 */
#[Seed]
#[Seeder(VerificacionSeeder::class)]
abstract class TestCase extends BaseTestCase
{
    //
}
