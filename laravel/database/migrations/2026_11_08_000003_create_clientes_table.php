<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('clientes', function (Blueprint $table) {
            $table->id();
            // NULL: cliente disponible.
            $table->foreignId('vendedor_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('nombre', 150);
            // NULL: consumidor final (CF). El índice único admite varios NULL.
            $table->string('nit', 12)->nullable()->unique();
            $table->char('telefono', 8)->unique();
            $table->string('correo', 150)->nullable();
            $table->datetimes();
        });

        DB::statement("ALTER TABLE clientes ADD CONSTRAINT chk_clientes_telefono CHECK (telefono REGEXP '^[2-9][0-9]{7}\$')");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('clientes');
    }
};
