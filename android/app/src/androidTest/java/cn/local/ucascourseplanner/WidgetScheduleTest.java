package cn.local.ucascourseplanner;

import static org.junit.Assert.*;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.appwidget.AppWidgetManager;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.TimeZone;

@RunWith(AndroidJUnit4.class)
public class WidgetScheduleTest {
    private TimeZone previous;
    private Context context;
    private String saved;
    @Before public void prepare() {
        previous = TimeZone.getDefault(); TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        saved = context.getSharedPreferences(WidgetSchedule.PREFS, 0).getString(WidgetSchedule.KEY, null);
    }
    @After public void restore() {
        TimeZone.setDefault(previous);
        context.getSharedPreferences(WidgetSchedule.PREFS, 0).edit().putString(WidgetSchedule.KEY, saved).commit();
    }
    private Date date(String value) throws Exception { return new SimpleDateFormat("yyyy-MM-dd HH:mm").parse(value); }
    private JSONObject snapshot() throws Exception {
        return new JSONObject("{\"version\":1,\"planName\":\"方案一\",\"semesterStart\":\"2026-09-09\",\"termWeeks\":22,\"courses\":[],\"periodTimes\":[[\"08:30\",\"09:15\"],[\"09:20\",\"10:05\"],[\"10:25\",\"11:10\"],[\"11:15\",\"12:00\"],[\"13:30\",\"14:15\"],[\"14:20\",\"15:05\"],[\"15:25\",\"16:10\"],[\"16:15\",\"17:00\"],[\"17:05\",\"17:50\"],[\"18:30\",\"19:15\"],[\"19:20\",\"20:05\"],[\"20:15\",\"21:00\"],[\"21:05\",\"21:50\"]]}");
    }
    private JSONObject course(String id, String sessions) throws Exception {
        return new JSONObject().put("id", id).put("name", "课程" + id).put("sessions", new JSONArray(sessions));
    }
    @Test public void mondayBoundaryAndOutsideTermDoNotDisplayClampedCourses() throws Exception {
        JSONObject data = snapshot();
        WidgetSchedule sunday = new WidgetSchedule(data, date("2026-09-13 23:59"));
        assertEquals(1, sunday.week); assertEquals(7, sunday.today); assertEquals("9/7", sunday.dates[0]);
        WidgetSchedule monday = new WidgetSchedule(data, date("2026-09-14 00:00"));
        assertEquals(2, monday.week); assertEquals(1, monday.today); assertEquals("9/20", monday.dates[6]);
        data.getJSONArray("courses").put(course("a", "[{day:1,periods:[1,2],weeks:[1,22],room:'A'}]"));
        WidgetSchedule before = new WidgetSchedule(data, date("2026-08-31 09:00"));
        assertEquals("before", before.state); assertTrue(before.events.isEmpty());
        WidgetSchedule after = new WidgetSchedule(data, date("2027-06-07 09:00"));
        assertEquals("after", after.state); assertTrue(after.events.isEmpty());
        data.put("semesterStart", "2026-02-30");
        assertEquals("unset", new WidgetSchedule(data, date("2026-09-14 00:00")).state);
    }
    @Test public void onlyCurrentWeekRoomsAndContiguousPeriodsAreCombined() throws Exception {
        JSONObject data = snapshot();
        data.getJSONArray("courses").put(course("a", "[{day:1,periods:[2,1,2,4],weeks:[2],room:'教一楼101'},{day:1,periods:[1,2],weeks:[3],room:'旧教室'},{day:1,periods:[1,2],weeks:[2],room:'教二楼202'}]"));
        data.getJSONArray("courses").put(course("b", "[{day:1,periods:[2,3],weeks:[2],room:'B'},{day:7,periods:[13],weeks:[2],room:'C'}]"));
        WidgetSchedule schedule = new WidgetSchedule(data, date("2026-09-14 08:00"));
        assertEquals(4, schedule.events.size()); assertEquals(3, schedule.todayEvents().size());
        WidgetSchedule.Event first = schedule.events.get(0);
        assertEquals(1, first.start); assertEquals(2, first.end); assertEquals(2, first.rooms.size());
        assertFalse(first.rooms.contains("旧教室")); assertTrue(first.conflict); assertEquals(2, first.lanes);
        assertEquals(1, schedule.events.get(1).lane);
        assertEquals("08:30", schedule.periodTime(first.start, false)); assertEquals("10:05", schedule.periodTime(first.end, true));
        WidgetSchedule sunday = new WidgetSchedule(data, date("2026-09-20 08:00"));
        assertEquals(1, sunday.todayEvents().size()); assertEquals("21:50", sunday.periodTime(13, true));
    }
    @Test public void dateCalculationSurvivesDaylightSaving() throws Exception {
        TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
        JSONObject data = snapshot().put("semesterStart", "2026-03-02");
        assertEquals(1, new WidgetSchedule(data, date("2026-03-08 23:59")).week);
        assertEquals(2, new WidgetSchedule(data, date("2026-03-09 00:00")).week);
    }
    @Test public void durableSnapshotIsReplacedAndMalformedWritesKeepPreviousPlan() throws Exception {
        JSONObject data = snapshot(); WidgetSchedule.save(context, data.toString());
        assertEquals("方案一", WidgetSchedule.read(context).planName);
        WidgetSchedule.save(context, data.put("planName", "另一方案").toString());
        assertEquals("另一方案", WidgetSchedule.read(context).planName);
        try { WidgetSchedule.save(context, "{}"); fail("Invalid snapshot accepted"); } catch (org.json.JSONException expected) {}
        assertEquals("另一方案", WidgetSchedule.read(context).planName);
    }
    @Test public void apkUpdateRefreshesSavedCourseDetailsAndDiscardsRemovedIds() throws Exception {
        JSONObject data = snapshot();
        data.getJSONArray("courses").put(course("314374", "[]")).put(course("removed-course", "[]"));
        WidgetSchedule.save(context, data.toString());
        WidgetSchedule.refreshCatalog(context);
        JSONObject saved = new JSONObject(context.getSharedPreferences(WidgetSchedule.PREFS, 0).getString(WidgetSchedule.KEY, "{}"));
        assertEquals(1, saved.getJSONArray("courses").length());
        JSONObject course = saved.getJSONArray("courses").getJSONObject(0);
        assertEquals("统计软件SAS", course.getString("name"));
        assertTrue(course.getJSONArray("sessions").length() > 0);
        assertEquals("方案一", saved.getString("planName"));
    }
    @Test public void remoteViewsInflateAndWeeklyBitmapStaysWithinMemoryBudget() throws Exception {
        JSONObject data = snapshot();
        data.getJSONArray("courses").put(course("a", "[{day:1,periods:[1,2],weeks:[2],room:'教一楼101'}]"));
        WidgetSchedule schedule = new WidgetSchedule(data, date("2026-09-14 08:00"));
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            FrameLayout parent = new FrameLayout(context);
            View row = WidgetViews.row(context, schedule, schedule.events.get(0)).apply(context, parent);
            assertEquals("08:30", ((TextView)row.findViewById(R.id.widget_start)).getText().toString());
            Bundle options = new Bundle(); options.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 320);
            options.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 400);
            View week = WidgetViews.build(context, 1, true, schedule, options).apply(context, parent);
            assertEquals(View.VISIBLE, week.findViewById(R.id.widget_grid).getVisibility());
            assertEquals("本周课表", ((TextView)week.findViewById(R.id.widget_title)).getText().toString());
            View today = WidgetViews.build(context, 2, false, schedule, options).apply(context, parent);
            assertEquals("今日课程", ((TextView)today.findViewById(R.id.widget_title)).getText().toString());
            Bitmap bitmap = WidgetViews.weekBitmap(context, schedule, 1600, 2200);
            assertTrue(bitmap.getAllocationByteCount() <= 5600000); bitmap.recycle();
        });
    }
}
