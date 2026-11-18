import { Outlet } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Navbar from '../navbar/Navbar';
import ToastContainer from '../common/ToastContainer';
import { isMac, isTauri } from '../../utils/env';

function Layout() {
    const showMacDragBar = isTauri() && isMac();

    return (
        <div className="min-h-dvh h-dvh flex flex-col bg-[#FAFBFC] dark:bg-slate-950 text-gray-900 dark:text-slate-100">
            {showMacDragBar && (
                <div
                    className="fixed top-0 left-0 right-0 h-9"
                    style={{
                        zIndex: 9999,
                        backgroundColor: 'rgba(0,0,0,0.001)',
                        cursor: 'default',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                    }}
                    data-tauri-drag-region
                    onMouseDown={() => {
                        getCurrentWindow().startDragging();
                    }}
                />
            )}
            <ToastContainer />
            <Navbar />
            <main className="flex-1 min-h-0 overflow-y-auto flex flex-col relative">
                <Outlet />
            </main>
        </div>
    );
}

export default Layout;
