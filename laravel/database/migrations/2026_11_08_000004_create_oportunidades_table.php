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
        Schema::create('oportunidades', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cliente_id')->constrained('clientes')->restrictOnDelete();
            $table->foreignId('vendedor_id')->constrained('users')->restrictOnDelete();
            $table->string('titulo', 150);
            $table->string('etapa', 20)->default('prospecto');
            $table->string('motivo_perdida', 255)->nullable();
            $table->dateTime('fecha_cierre')->nullable();
            $table->datetimes();
        });

        DB::statement("ALTER TABLE oportunidades ADD CONSTRAINT chk_oportunidades_etapa CHECK (etapa IN ('prospecto', 'calificado', 'propuesta', 'negociacion', 'ganada', 'perdida'))");
        // Motivo presente si y solo si la etapa es perdida.
        DB::statement("ALTER TABLE oportunidades ADD CONSTRAINT chk_oportunidades_motivo CHECK ((etapa = 'perdida') = (motivo_perdida IS NOT NULL))");
        // Fecha de cierre presente si y solo si la etapa es ganada o perdida.
        DB::statement("ALTER TABLE oportunidades ADD CONSTRAINT chk_oportunidades_cierre CHECK ((etapa IN ('ganada', 'perdida')) = (fecha_cierre IS NOT NULL))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('oportunidades');
    }
};
