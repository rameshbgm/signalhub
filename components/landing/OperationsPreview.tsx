import {
  Activity,
  BellRing,
  Check,
  CircleCheckBig,
  CloudCog,
  Globe2,
  Mail,
  MessageSquareMore,
  RadioTower,
  ServerCog,
  ShieldCheck,
  Webhook,
} from "lucide-react";
import type { CSSProperties } from "react";
import styles from "./landing.module.css";

const SERVICES = [
  { name: "API gateway", uptime: "99.99%", history: [8] },
  { name: "Customer dashboard", uptime: "99.98%", history: [13] },
  { name: "Webhooks", uptime: "100%", history: [] },
] as const;

export default function OperationsPreview() {
  return (
    <div className={styles.operationsPreview} aria-hidden="true">
      <div className={styles.opsHalo} />
      <div className={`${styles.opsConnector} ${styles.opsConnectorMonitor}`} />
      <div className={`${styles.opsConnector} ${styles.opsConnectorDelivery}`} />
      <div className={`${styles.opsConnector} ${styles.opsConnectorIncident}`} />

      <section className={styles.statusConsole}>
        <div className={styles.consoleChrome}>
          <span />
          <span />
          <span />
          <p>status.signalhub.local</p>
          <ShieldCheck size={13} />
        </div>
        <div className={styles.consoleHeader}>
          <div className={styles.consoleBrand}>
            <span className={styles.consoleMark}>
              <i />
              <i />
              <i />
            </span>
            <span>
              <small>SIGNALHUB</small>
              <strong>Core services</strong>
            </span>
          </div>
          <span className={styles.liveBadge}>
            <i /> Live
          </span>
        </div>

        <div className={styles.operationalBanner}>
          <CircleCheckBig size={19} />
          <span>
            <strong>All systems operational</strong>
            <small>Updated 12 seconds ago</small>
          </span>
        </div>

        <div className={styles.serviceList}>
          {SERVICES.map((service, serviceIndex) => (
            <div className={styles.serviceRow} key={service.name}>
              <div className={styles.serviceMeta}>
                <span>{service.name}</span>
                <strong>{service.uptime}</strong>
              </div>
              <div className={styles.uptimeTrack}>
                {Array.from({ length: 18 }, (_, index) => (
                  <i
                    className={(service.history as readonly number[]).includes(index) ? styles.uptimeBlip : ""}
                    style={{ "--bar-delay": `${serviceIndex * 0.08 + index * 0.025}s` } as CSSProperties}
                    key={index}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className={`${styles.opsCard} ${styles.monitorCard}`}>
        <div className={styles.opsCardTop}>
          <span className={styles.blueIcon}><Activity size={16} /></span>
          <small>MONITORING</small>
          <span className={styles.healthyPill}>Healthy</span>
        </div>
        <strong>48 checks passing</strong>
        <p>HTTP · DNS · SSL · Heartbeat</p>
        <div className={styles.monitorWave}>
          {[10, 18, 13, 25, 17, 30, 21, 15, 24, 13, 19, 11].map((height, index) => (
            <i style={{ height, "--wave-delay": `${index * 0.08}s` } as CSSProperties} key={index} />
          ))}
        </div>
      </aside>

      <aside className={`${styles.opsCard} ${styles.infrastructureCard}`}>
        <span className={styles.violetIcon}><ServerCog size={17} /></span>
        <span>
          <small>SELF-HOSTED</small>
          <strong>Your network. Your data.</strong>
        </span>
        <Check size={15} />
      </aside>

      <aside className={`${styles.opsCard} ${styles.incidentCard}`}>
        <div className={styles.opsCardTop}>
          <span className={styles.mintIcon}><RadioTower size={16} /></span>
          <small>INCIDENT AUTOMATION</small>
        </div>
        <strong>Recovery confirmed</strong>
        <div className={styles.incidentTimeline}>
          <span><i /> Detected <b>09:41</b></span>
          <span><i /> Subscribers updated <b>09:42</b></span>
          <span><i /> Resolved <b>09:43</b></span>
        </div>
      </aside>

      <aside className={`${styles.opsCard} ${styles.deliveryCard}`}>
        <div className={styles.opsCardTop}>
          <span className={styles.violetIcon}><BellRing size={16} /></span>
          <small>AUDIENCE DELIVERY</small>
        </div>
        <strong>Update delivered</strong>
        <div className={styles.deliveryChannels}>
          <span><Mail size={14} /></span>
          <span><MessageSquareMore size={14} /></span>
          <span><Webhook size={14} /></span>
          <span><Globe2 size={14} /></span>
        </div>
        <div className={styles.deliveryResult}>
          <span><i /></span>
          <p>4 / 4 channels verified</p>
          <CircleCheckBig size={15} />
        </div>
      </aside>

      <div className={styles.opsOrbitIcon}><CloudCog size={16} /></div>
    </div>
  );
}
