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
        Schema::create('actividades', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cliente_id')->constrained('clientes')->cascadeOnDelete();
            // Quién la registró.
            $table->foreignId('vendedor_id')->constrained('users')->restrictOnDelete();
            $table->string('tipo', 10);
            $table->string('descripcion', 500);
            $table->dateTime('vence_en')->nullable();
            $table->boolean('completada')->default(false);
            $table->datetimes();
        });

        DB::statement("ALTER TABLE actividades ADD CONSTRAINT chk_actividades_tipo CHECK (tipo IN ('llamada', 'reunion', 'tarea'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('actividades');
    }
};
