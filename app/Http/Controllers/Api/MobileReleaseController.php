<?php

namespace App\Http\Controllers\Api;

use App\Domain\Mobile\MobileReleaseCatalog;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class MobileReleaseController extends Controller
{
    public function __construct(
        private readonly MobileReleaseCatalog $catalog,
    ) {
    }

    public function latestAndroid(): JsonResponse
    {
        return response()->json([
            'data' => $this->withPageUrl($this->catalog->android()),
        ]);
    }

    /**
     * @param  array<string, mixed>  $release
     * @return array<string, mixed>
     */
    private function withPageUrl(array $release): array
    {
        $release['page_url'] = route('mobile.latest');

        return $release;
    }
}
