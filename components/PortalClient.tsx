"use client";

import PortalClientV2 from "@/components/PortalClientV2";

export default function PortalClient(props: any) {
  return (
    <>
      <PortalClientV2 {...props} />
      <a className="myPositionPortalButton" href="/espace/poste">Mon poste</a>
      <style jsx global>{`
        .myPositionPortalButton {
          position: fixed;
          z-index: 80;
          left: 18px;
          bottom: 76px;
          width: 232px;
          padding: 11px 14px;
          border-radius: 10px;
          background: #f5d66f;
          color: #17382b;
          border: 1px solid #d3b74f;
          box-shadow: 0 5px 18px rgba(0,0,0,.18);
          text-align: center;
          text-decoration: none;
          font-weight: 800;
        }
        .myPositionPortalButton:hover { transform: translateY(-1px); }
        @media (max-width: 900px) {
          .myPositionPortalButton { left: auto; right: 14px; bottom: 14px; width: auto; }
        }
      `}</style>
    </>
  );
}
