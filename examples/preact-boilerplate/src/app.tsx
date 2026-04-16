import { LocationProvider, Router, Route } from "preact-iso";
import { readGlobal } from "./lib/content";
import { Navbar } from "./components/navbar";
import { Footer } from "./components/footer";
import { Home } from "./pages/home";
import { PageView } from "./pages/page";
import { BlogList } from "./pages/blog-list";
import { BlogPost } from "./pages/blog-post";
import { NotFound } from "./pages/not-found";

export function App() {
  const global = readGlobal();

  return (
    <LocationProvider>
      <div class="flex min-h-screen flex-col">
        <Navbar siteTitle={global.siteTitle} navLinks={global.navLinks ?? []} />
        <main class="flex-1">
          <Router>
            <Route path="/" component={Home} />
            <Route path="/blog" component={BlogList} />
            <Route path="/blog/:slug" component={BlogPost} />
            <Route path="/:slug" component={PageView} />
            <Route default component={NotFound} />
          </Router>
        </main>
        <Footer footerText={global.footerText} siteTitle={global.siteTitle} />
      </div>
    </LocationProvider>
  );
}
