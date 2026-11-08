<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Regla propia (RP): NULL significa que el producto no controla inventario.
     */
    public function up(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->integer('stock')->nullable()->after('activo');
        });

        DB::statement('ALTER TABLE productos ADD CONSTRAINT chk_productos_stock CHECK (stock IS NULL OR stock >= 0)');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('ALTER TABLE productos DROP CHECK chk_productos_stock');

        Schema::table('productos', function (Blueprint $table) {
            $table->dropColumn('stock');
        });
    }
};
