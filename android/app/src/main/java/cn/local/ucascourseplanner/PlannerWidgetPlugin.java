package cn.local.ucascourseplanner;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PlannerWidget")
public class PlannerWidgetPlugin extends Plugin {
    @PluginMethod
    public void syncState(PluginCall call) {
        getBridge().execute(() -> {
            try {
                WidgetSchedule.save(getContext(), call.getString("data"));
                PlannerWidgetProvider.refreshAll(getContext());
                call.resolve();
            } catch (Exception error) { call.reject("无法同步桌面组件", error); }
        });
    }

    @PluginMethod
    public void pinWidget(PluginCall call) {
        String kind = call.getString("kind");
        if (!"today".equals(kind) && !"week".equals(kind)) { call.reject("未知组件类型"); return; }
        getActivity().runOnUiThread(() -> {
            AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
            boolean supported = Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported();
            if (supported) {
                Class<?> provider = "week".equals(kind) ? WeekWidgetProvider.class : TodayWidgetProvider.class;
                Bundle extras = new Bundle();
                if (Build.VERSION.SDK_INT >= 31) {
                    Bundle size = new Bundle();
                    size.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 320);
                    size.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, "week".equals(kind) ? 460 : 300);
                    extras.putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW,
                        WidgetViews.build(getContext(), -1, "week".equals(kind), WidgetSchedule.read(getContext()), size));
                }
                supported = manager.requestPinAppWidget(new ComponentName(getContext(), provider), extras, null);
            }
            JSObject result = new JSObject(); result.put("supported", supported); call.resolve(result);
        });
    }
}
