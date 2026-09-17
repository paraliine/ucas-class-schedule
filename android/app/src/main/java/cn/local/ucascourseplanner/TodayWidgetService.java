package cn.local.ucascourseplanner;

import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;

/** Collection adapter for Android 7–11; Android 12+ uses RemoteCollectionItems. */
public class TodayWidgetService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new RemoteViewsFactory() {
            private WidgetSchedule schedule;
            private List<WidgetSchedule.Event> events = new ArrayList<>();
            @Override public void onCreate() { onDataSetChanged(); }
            @Override public void onDataSetChanged() { schedule = WidgetSchedule.read(TodayWidgetService.this); events = schedule.todayEvents(); }
            @Override public void onDestroy() { events.clear(); }
            @Override public int getCount() { return events.size(); }
            @Override public RemoteViews getViewAt(int position) {
                return position < 0 || position >= events.size() ? null : WidgetViews.row(TodayWidgetService.this, schedule, events.get(position));
            }
            @Override public RemoteViews getLoadingView() { return null; }
            @Override public int getViewTypeCount() { return 1; }
            @Override public long getItemId(int position) { return position; }
            @Override public boolean hasStableIds() { return false; }
        };
    }
}
