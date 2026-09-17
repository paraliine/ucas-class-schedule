package cn.local.ucascourseplanner;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WidgetRefreshReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult result = goAsync();
        new Thread(() -> {
            try {
                if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
                    try { WidgetSchedule.refreshCatalog(context); }
                    catch (Exception error) { android.util.Log.w("PlannerWidget", "Catalog refresh failed", error); }
                }
                PlannerWidgetProvider.refreshAll(context);
            } finally { result.finish(); }
        }, "widget-refresh").start();
    }
}
