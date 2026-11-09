<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * Solo la semilla oficial: php artisan migrate:fresh --seeder=VerificacionSeeder
     */
    public function run(): void
    {
        $this->call([
            VerificacionSeeder::class,
            SectorSeeder::class,
        ]);
    }
}
