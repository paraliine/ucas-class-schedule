package cn.local.ucascourseplanner;

import static org.junit.Assert.*;
import android.app.Activity;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Run on a disposable emulator after: adb shell appwidget grantbind --package cn.local.ucascourseplanner */
@RunWith(AndroidJUnit4.class)
public class WidgetInitializationTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private void main(Runnable action) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action); }

    private String javascript(MainActivity activity, String code) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> value = new AtomicReference<>();
        main(() -> activity.getBridge().getWebView().evaluateJavascript(code, result -> { value.set(result); done.countDown(); }));
        assertTrue("WebView callback timed out", done.await(10, TimeUnit.SECONDS)); return value.get();
    }

    @Test public void launcherConfigurationRestoresExistingWebPlanWithoutNativeCache() throws Exception {
        AtomicReference<MainActivity> app = new AtomicReference<>();
        String original;
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(app::set);
            boolean ready = false;
            for (int i = 0; i < 100 && !ready; i++) {
                ready = "true".equals(javascript(app.get(), "document.body.dataset.ready==='true'"));
                if (!ready) Thread.sleep(100);
            }
            assertTrue("App did not finish loading", ready);
            original = javascript(app.get(), "localStorage.getItem('ucas-planner-v1-89576')");
            javascript(app.get(), "localStorage.setItem('ucas-planner-v1-89576',JSON.stringify({version:1,activeId:'saved',plans:[{id:'saved',name:'已有方案',ids:['314374']}],semesterStart:'2026-08-31',week:8}));true");
        }
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        AppWidgetHost host = new AppWidgetHost(context, 130131);
        try {
            main(host::startListening);
            for (Class<?> type : new Class<?>[]{TodayWidgetProvider.class, WeekWidgetProvider.class}) {
                context.getSharedPreferences(WidgetSchedule.PREFS, 0).edit().clear().commit();
                int id = host.allocateAppWidgetId();
                Bundle size = new Bundle(); size.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 320);
                size.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 460);
                assertTrue("Grant widget binding to the test app first", manager.bindAppWidgetIdIfAllowed(id, new ComponentName(context, type), size));
                AtomicReference<AppWidgetHostView> view = new AtomicReference<>();
                main(() -> view.set(host.createView(context, id, manager.getAppWidgetInfo(id))));
                Intent configure = new Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
                    .setClass(context, WidgetConfigurationActivity.class).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
                try (ActivityScenario<WidgetConfigurationActivity> scenario = ActivityScenario.launchActivityForResult(configure)) {
                    assertEquals(Activity.RESULT_OK, scenario.getResult().getResultCode());
                    assertEquals(id, scenario.getResult().getResultData().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1));
                }
                WidgetSchedule saved = WidgetSchedule.read(context);
                assertEquals("已有方案", saved.planName); assertEquals(1, saved.courseCount); assertFalse(saved.state.equals("unset"));
                AtomicReference<String> label = new AtomicReference<>();
                for (int i = 0; i < 50 && !"已有方案".equals(label.get()); i++) {
                    main(() -> { TextView text = view.get().findViewById(R.id.widget_plan); label.set(text == null ? "" : text.getText().toString()); });
                    if (!"已有方案".equals(label.get())) Thread.sleep(100);
                }
                assertEquals("The launcher must receive the initialized RemoteViews", "已有方案", label.get());
                host.deleteAppWidgetId(id);
            }
        } finally {
            main(host::stopListening); host.deleteHost();
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                scenario.onActivity(app::set);
                javascript(app.get(), original.equals("null") ? "localStorage.removeItem('ucas-planner-v1-89576')" :
                    "localStorage.setItem('ucas-planner-v1-89576'," + original + ")");
            }
        }
    }
}
