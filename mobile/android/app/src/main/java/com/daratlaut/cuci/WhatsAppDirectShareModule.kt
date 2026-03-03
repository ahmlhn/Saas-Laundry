package com.daratlaut.cuci

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class WhatsAppDirectShareModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "WhatsAppDirectShare"

  @ReactMethod
  fun shareReceiptToCustomer(phoneDigits: String, imageUri: String, message: String?, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("ERR_NO_ACTIVITY", "Aktivitas aplikasi tidak tersedia.")
      return
    }

    val normalizedPhone = phoneDigits.filter { it.isDigit() }
    if (normalizedPhone.isBlank()) {
      promise.reject("ERR_INVALID_PHONE", "Nomor pelanggan tidak valid.")
      return
    }

    val resolvedPackage = resolveWhatsAppPackage()
    if (resolvedPackage == null) {
      promise.reject("ERR_WHATSAPP_NOT_INSTALLED", "WhatsApp tidak terpasang di perangkat ini.")
      return
    }

    val file = resolveShareFile(imageUri)
    if (file == null || !file.exists()) {
      promise.reject("ERR_FILE_NOT_FOUND", "Gambar nota tidak ditemukan.")
      return
    }

    val contentUri = try {
      FileProvider.getUriForFile(
        reactContext,
        "${reactContext.packageName}.fileprovider",
        file,
      )
    } catch (error: Throwable) {
      promise.reject("ERR_FILE_URI", error.message ?: "Gagal menyiapkan file gambar nota.")
      return
    }

    val jid = "$normalizedPhone@s.whatsapp.net"
    val intent = Intent(Intent.ACTION_SEND).apply {
      type = "image/png"
      setPackage(resolvedPackage)
      clipData = ClipData.newUri(reactContext.contentResolver, "nota", contentUri)
      putExtra(Intent.EXTRA_STREAM, contentUri)
      putExtra("jid", jid)
      if (!message.isNullOrBlank()) {
        putExtra(Intent.EXTRA_TEXT, message)
      }
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    try {
      reactContext.grantUriPermission(
        resolvedPackage,
        contentUri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION,
      )
      activity.startActivity(intent)
      promise.resolve(true)
    } catch (error: ActivityNotFoundException) {
      promise.reject("ERR_WHATSAPP_OPEN", "Gagal membuka WhatsApp.")
    } catch (error: Throwable) {
      promise.reject("ERR_WHATSAPP_SHARE", error.message ?: "Gagal mengirim nota ke WhatsApp.")
    }
  }

  private fun resolveShareFile(imageUri: String): File? {
    if (imageUri.isBlank()) {
      return null
    }

    val uri = Uri.parse(imageUri)
    return when {
      uri.scheme.equals("file", ignoreCase = true) && !uri.path.isNullOrBlank() -> File(uri.path!!)
      uri.scheme.isNullOrBlank() -> File(imageUri)
      else -> null
    }
  }

  private fun resolveWhatsAppPackage(): String? {
    val packageManager = reactContext.packageManager
    val candidates = listOf("com.whatsapp", "com.whatsapp.w4b")
    return candidates.firstOrNull { packageName ->
      isPackageInstalled(packageManager, packageName)
    }
  }

  private fun isPackageInstalled(packageManager: PackageManager, packageName: String): Boolean {
    return try {
      @Suppress("DEPRECATION")
      packageManager.getPackageInfo(packageName, 0)
      true
    } catch (_: Throwable) {
      false
    }
  }
}
