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
        Schema::create('historial_etapas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('oportunidad_id')->constrained('oportunidades')->cascadeOnDelete();
            $table->foreignId('usuario_id')->constrained('users')->restrictOnDelete();
            // NULL en el registro de creación.
            $table->string('etapa_anterior', 20)->nullable();
            $table->string('etapa_nueva', 20);
            // Solo fecha del cambio: esta tabla no tiene updated_at.
            $table->dateTime('created_at');
        });

        DB::statement("ALTER TABLE historial_etapas ADD CONSTRAINT chk_historial_etapas_etapa_anterior CHECK (etapa_anterior IS NULL OR etapa_anterior IN ('prospecto', 'calificado', 'propuesta', 'negociacion', 'ganada', 'perdida'))");
        DB::statement("ALTER TABLE historial_etapas ADD CONSTRAINT chk_historial_etapas_etapa_nueva CHECK (etapa_nueva IN ('prospecto', 'calificado', 'propuesta', 'negociacion', 'ganada', 'perdida'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('historial_etapas');
    }
};
