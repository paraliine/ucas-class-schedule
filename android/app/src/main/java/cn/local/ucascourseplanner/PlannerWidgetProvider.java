package cn.local.ucascourseplanner;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import java.util.Calendar;

public abstract class PlannerWidgetProvider extends AppWidgetProvider {
    protected abstract boolean weekly();

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        WidgetSchedule schedule = WidgetSchedule.read(context);
        for (int id : ids) update(context, manager, id, weekly(), schedule, manager.getAppWidgetOptions(id));
        scheduleMidnight(context);
    }
    @Override public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        update(context, manager, id, weekly(), WidgetSchedule.read(context), options);
    }
    @Override public void onDisabled(Context context) { scheduleMidnight(context); }

    static boolean owns(Context context, AppWidgetProviderInfo info) {
        return info != null && info.provider.getPackageName().equals(context.getPackageName())
            && (info.provider.getClassName().equals(TodayWidgetProvider.class.getName())
                || info.provider.getClassName().equals(WeekWidgetProvider.class.getName()));
    }

    static void update(Context context, AppWidgetManager manager, int id, boolean weekly, WidgetSchedule schedule, Bundle options) {
        manager.updateAppWidget(id, WidgetViews.build(context, id, weekly, schedule, options));
        if (!weekly && (Build.VERSION.SDK_INT < 31 || schedule.todayEvents().size() > 100)) manager.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
    }
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        WidgetSchedule schedule = WidgetSchedule.read(context);
        RuntimeException failure = null;
        for (Class<?> type : new Class<?>[]{TodayWidgetProvider.class, WeekWidgetProvider.class}) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context, type))) {
                try { update(context, manager, id, type == WeekWidgetProvider.class, schedule, manager.getAppWidgetOptions(id)); }
                catch (RuntimeException error) { failure = error; android.util.Log.e("PlannerWidget", "Cannot refresh widget " + id, error); }
            }
        }
        scheduleMidnight(context);
        if (failure != null) throw failure;
    }
    static void scheduleMidnight(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        boolean any = manager.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class)).length
            + manager.getAppWidgetIds(new ComponentName(context, WeekWidgetProvider.class)).length > 0;
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent next = PendingIntent.getBroadcast(context, 102,
            new Intent(context, WidgetRefreshReceiver.class).setAction("cn.local.ucascourseplanner.WIDGET_MIDNIGHT"),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (!any) { alarm.cancel(next); return; }
        Calendar midnight = Calendar.getInstance(); midnight.add(Calendar.DAY_OF_MONTH, 1);
        midnight.set(Calendar.HOUR_OF_DAY, 0); midnight.set(Calendar.MINUTE, 0);
        midnight.set(Calendar.SECOND, 1); midnight.set(Calendar.MILLISECOND, 0);
        // Inexact and non-wakeup: no exact-alarm permission or background polling.
        alarm.set(AlarmManager.RTC, midnight.getTimeInMillis(), next);
    }
}
