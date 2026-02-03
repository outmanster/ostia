package cc.opensaas.ostia

import android.content.pm.ActivityInfo
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    val isTablet = resources.configuration.smallestScreenWidthDp >= 600
    requestedOrientation = if (isTablet) {
      ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    } else {
      ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
    }
    super.onCreate(savedInstanceState)
  }
}
