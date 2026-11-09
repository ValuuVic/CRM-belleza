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
        Schema::create('oportunidad_productos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('oportunidad_id')->constrained('oportunidades')->cascadeOnDelete();
            $table->foreignId('producto_id')->constrained('productos')->restrictOnDelete();
            $table->unsignedSmallInteger('cantidad');
            // Precio del catálogo al agregar la línea; no cambia si cambia el catálogo.
            $table->decimal('precio_unitario', 10, 2);
            $table->datetimes();

            $table->unique(['oportunidad_id', 'producto_id']);
        });

        DB::statement('ALTER TABLE oportunidad_productos ADD CONSTRAINT chk_oportunidad_productos_cantidad CHECK (cantidad BETWEEN 1 AND 999)');
        DB::statement('ALTER TABLE oportunidad_productos ADD CONSTRAINT chk_oportunidad_productos_precio CHECK (precio_unitario > 0)');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('oportunidad_productos');
    }
};
