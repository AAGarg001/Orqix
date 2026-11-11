import { BlobButton } from "./BlobButton";
import {Component,type ReactNode} from 'react';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="oq-setup"><section className="oq-card"><h1>Workspace view could not load</h1><p>Your server-side work is independent of this page. Reload the view; if the problem persists, contact your administrator.</p><BlobButton className="oq-button primary" onClick={()=>location.reload()}>Reload workspace</BlobButton></section></div>:this.props.children;}
}
