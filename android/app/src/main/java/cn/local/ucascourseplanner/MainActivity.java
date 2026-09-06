package cn.local.ucascourseplanner;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlannerDocumentsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
