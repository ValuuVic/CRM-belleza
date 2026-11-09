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
        Schema::table('users', function (Blueprint $table) {
            $table->string('rol', 20)->default('vendedor')->after('password');
            $table->foreignId('supervisor_id')->nullable()->after('rol')
                ->constrained('users')->restrictOnDelete();
            $table->boolean('activo')->default(true)->after('supervisor_id');
        });

        DB::statement("ALTER TABLE users ADD CONSTRAINT chk_users_rol CHECK (rol IN ('administrador', 'supervisor', 'vendedor'))");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('ALTER TABLE users DROP CHECK chk_users_rol');

        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('supervisor_id');
            $table->dropColumn(['rol', 'activo']);
        });
    }
};
