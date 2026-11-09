<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Datos propios de la distribuidora de maquillaje (§13.2). Se llena en su propia fase.
 *
 * No puede repetir correos, NIT ni teléfonos de VerificacionSeeder, ni pasar de 10 clientes
 * por vendedor.
 */
class SectorSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        //
    }
}
