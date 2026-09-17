package cn.local.ucascourseplanner;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.os.Bundle;

/** The launcher starts this in the foreground, even before the upgraded app was opened. */
public class WidgetConfigurationActivity extends MainActivity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override public void onCreate(Bundle savedInstanceState) {
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        setResult(RESULT_CANCELED);
        // MainActivity's WebView uses the same origin/storage as the app. Its normal
        // initialization restores the active plan and passes a fresh snapshot to Java.
        super.onCreate(savedInstanceState);
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
        if (!PlannerWidgetProvider.owns(this, info)) finish();
    }

    void snapshotReady() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            AppWidgetManager manager = AppWidgetManager.getInstance(this);
            AppWidgetProviderInfo info = manager.getAppWidgetInfo(widgetId);
            if (!PlannerWidgetProvider.owns(this, info)) { finish(); return; }
            try {
                PlannerWidgetProvider.update(this, manager, widgetId,
                    info.provider.getClassName().equals(WeekWidgetProvider.class.getName()),
                    WidgetSchedule.read(this), manager.getAppWidgetOptions(widgetId));
                PlannerWidgetProvider.scheduleMidnight(this);
                setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
                finish();
            } catch (RuntimeException error) {
                android.util.Log.e("PlannerWidget", "Cannot initialize widget", error);
                // Keep the app available so the user can retry instead of saving a blank widget.
            }
        });
    }
}
