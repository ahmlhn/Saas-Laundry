<?php

namespace App\Http\Controllers\Web;

use App\Domain\Mobile\MobileReleaseCatalog;
use App\Http\Controllers\Controller;
use Illuminate\View\View;

class MobileReleaseController extends Controller
{
    public function __construct(
        private readonly MobileReleaseCatalog $catalog,
    ) {
    }

    public function latest(): View
    {
        $release = $this->catalog->android();
        $release['page_url'] = route('mobile.latest');

        return view('web.mobile.latest', [
            'title' => 'Update Aplikasi Android',
            'release' => $release,
        ]);
    }
}
