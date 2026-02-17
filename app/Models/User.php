<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'tenant_id',
        'name',
        'phone',
        'email',
        'status',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')->withTimestamps();
    }

    public function outlets(): BelongsToMany
    {
        return $this->belongsToMany(Outlet::class, 'user_outlets')->withTimestamps();
    }

    public function hasRole(string $roleKey): bool
    {
        if (! $this->relationLoaded('roles')) {
            $this->load('roles:id,key');
        }

        return $this->roles->contains(fn (Role $role): bool => $role->key === $roleKey);
    }

    /**
     * @param array<int, string> $roleKeys
     */
    public function hasAnyRole(array $roleKeys): bool
    {
        foreach ($roleKeys as $roleKey) {
            if ($this->hasRole($roleKey)) {
                return true;
            }
        }

        return false;
    }

    public function hasOutletAccess(string $outletId): bool
    {
        if ($this->hasRole('owner')) {
            return true;
        }

        if (! $this->relationLoaded('outlets')) {
            $this->load('outlets:id');
        }

        return $this->outlets->contains(fn (Outlet $outlet): bool => $outlet->id === $outletId);
    }
}
